import io, csv, json, uuid
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Request
from pydantic import BaseModel
from schema import PatientProfile
from db import db, latest, put, out, draft, ids
from llm import MODEL, br, tool_call, embed
from checks import rules, audit
from routes_encounter import release

router = APIRouter(prefix="/api")
SCHEMA = PatientProfile.model_json_schema()
GEN_SYS = ("You are a clinical educator building a virtual patient for student interviews. Turn the faculty description into a complete, realistic, internally consistent profile, "
 "filling every section. Vitals default to trigger 'start'; exam findings to 'exam_requested' (value = the exam name). Sensitive history (smoking, alcohol, non-adherence) goes in "
 "disclosure.rules as if_asked or only_if_probed. Write learning objectives and key questions. Leave artifacts and knowledge empty. Never contradict the faculty description.")
IMPORT_SYS = ("You are importing one patient record from a faculty dataset into the profile schema. Map every column or field you can to the right section. "
 "Do NOT invent clinical facts that are not in the record; leave unknown fields blank. You may derive a title and case summary from the record. Leave artifacts and knowledge empty.")
class Gen(BaseModel): description: str

def build(text, who, system):
    prof = PatientProfile(**tool_call(MODEL, system, [{"text": text}], "save_patient", SCHEMA)).model_dump()
    prof["metadata"]["created_by"] = prof["metadata"]["created_by"] or who
    pid = uuid.uuid4().hex[:8]; put(pid, 1, "draft", ids(prof)); return pid

@router.get("/schema")
def schema(): return SCHEMA

@router.get("/patients")
def library(request: Request):
    rows = db.execute("select * from p p1 where ver=(select max(ver) from p p2 where p2.pid=p1.pid) order by rowid desc").fetchall(); res = []
    for r in rows:
        p = json.loads(r["profile"]); o = p["overview"]
        res.append(dict(pid=r["pid"], ver=r["ver"], status=r["status"], name=p["demographics"]["name"] or o["title"], complaint=o["chief_complaint"],
            tags=p["metadata"]["tags"], difficulty=o["difficulty"], live=bool(db.execute("select 1 from p where pid=? and status='published'", (r["pid"],)).fetchone())))
    return res if request.state.user["role"] == "faculty" else [x for x in res if x["live"]]

@router.post("/patients/generate")
def generate(b: Gen, request: Request): return out(latest(build(b.description, request.state.user["name"], GEN_SYS)))

@router.post("/patients/import")
async def import_data(request: Request, file: UploadFile = File(...)):
    raw = (await file.read()).decode("utf-8", "ignore")
    if file.filename.lower().endswith(".csv"): rows = list(csv.DictReader(io.StringIO(raw)))
    else:
        d = json.loads(raw); rows = d if isinstance(d, list) else next((v for v in d.values() if isinstance(v, list)), [d])
    if not rows: raise HTTPException(422, "No patient records found in that file.")
    for r in rows[:25]: build(json.dumps(r), request.state.user["name"], IMPORT_SYS)
    return {"imported": len(rows[:25])}

@router.get("/patients/{pid}")
def get(pid: str): return out(latest(pid))

@router.put("/patients/{pid}")
def update(pid: str, prof: dict):
    r = draft(pid); v = prof.get("_verified", []); prof = PatientProfile(**prof).model_dump() | {"_verified": v}
    put(pid, r["ver"], "draft", ids(prof), None, json.loads(r["chunks"])); return out(latest(pid))

@router.post("/patients/{pid}/check")
def check(pid: str):
    r = latest(pid); p = json.loads(r["profile"]); iss = rules(p) + audit(p)
    db.execute("update p set issues=? where pid=? and ver=?", (json.dumps(iss), pid, r["ver"])); db.commit(); return iss

class Probe(BaseModel): message: str; turn: int = 1
@router.post("/patients/{pid}/test-triggers")
def test_triggers(pid: str, b: Probe):  # faculty: "if a student typed this, what would unlock?"
    p = json.loads(latest(pid)["profile"])
    return [dict(group=x["group"], label=x["item"].get("label") or x["item"].get("title"), reason=x["reason"]) for x in release(p, b.message, b.turn, [])]

@router.post("/patients/{pid}/issues/{i}/dismiss")
def dismiss(pid: str, i: int):
    r = latest(pid); iss = json.loads(r["issues"])
    if iss[i]["src"] == "rule": raise HTTPException(422, "Rule-based issues must be fixed in the profile, then re-run the check.")
    iss[i]["status"] = "dismissed"
    db.execute("update p set issues=? where pid=? and ver=?", (json.dumps(iss), pid, r["ver"])); db.commit(); return iss

@router.post("/patients/{pid}/publish")
def publish(pid: str):
    r = latest(pid)
    if r["status"] != "draft": raise HTTPException(422, "Only drafts can be published.")
    if r["issues"] == "null": raise HTTPException(422, "Run the consistency check before publishing.")
    p = json.loads(r["profile"])
    block = [i for i in rules(p) + [x for x in json.loads(r["issues"]) if x["src"] == "llm"] if i["sev"] == "critical" and i["status"] == "open"]
    if block: raise HTTPException(422, f"{len(block)} critical issue(s) unresolved: " + "; ".join(b["issue"] for b in block))
    db.execute("update p set status='published' where pid=? and ver=?", (pid, r["ver"])); db.commit(); return out(latest(pid))

@router.post("/patients/{pid}/duplicate")
def duplicate(pid: str):
    p = json.loads(latest(pid)["profile"]); p["demographics"]["name"] += " (copy)"; n = uuid.uuid4().hex[:8]
    put(n, 1, "draft", ids({**p, "artifacts": [dict(a, id="") for a in p["artifacts"]]})); return out(latest(n))

@router.post("/patients/{pid}/archive")
def archive(pid: str):
    r = latest(pid); db.execute("update p set status='archived' where pid=? and ver=?", (pid, r["ver"])); db.commit(); return out(latest(pid))

@router.post("/patients/{pid}/artifacts")
async def add_artifact(pid: str, title: str = Form(...), kind: str = Form("lab"), ttype: str = Form("start"),
                       tvalue: str = Form(""), file: UploadFile = File(...)):
    r = draft(pid); p = json.loads(r["profile"]); data = await file.read()
    name = uuid.uuid4().hex[:8] + "_" + file.filename.replace("/", "_"); open(f"uploads/{name}", "wb").write(data)
    findings = ""
    ext = name.rsplit(".", 1)[-1].lower()
    if ext in ("png", "jpg", "jpeg"):  # vision draft; faculty confirms
        try:
            rr = br.converse(modelId=MODEL, messages=[{"role": "user", "content": [
                {"image": {"format": "jpeg" if ext == "jpg" else ext, "source": {"bytes": data}}},
                {"text": f"This is a {kind} titled '{title}' for a teaching case. Describe the key findings in 2-3 plain sentences a student would see. No diagnosis."}]}])
            findings = rr["output"]["message"]["content"][0]["text"]
        except Exception: pass
    p["artifacts"].append(dict(id=uuid.uuid4().hex[:8], title=title, kind=kind, file_url="/files/" + name, findings=findings,
                               trigger=dict(type=ttype, value=tvalue or None)))
    put(pid, r["ver"], "draft", p, None, json.loads(r["chunks"])); return out(latest(pid))

@router.post("/patients/{pid}/knowledge")
async def add_knowledge(pid: str, file: UploadFile = File(...)):
    r = draft(pid); p = json.loads(r["profile"]); raw = await file.read()
    if file.filename.lower().endswith(".pdf"):
        from pypdf import PdfReader
        text = "\n".join(pg.extract_text() or "" for pg in PdfReader(io.BytesIO(raw)).pages)
    else: text = raw.decode("utf-8", "ignore")
    parts = [text[i:i + 1000] for i in range(0, len(text), 800) if text[i:i + 1000].strip()][:60]
    chunks = json.loads(r["chunks"]) + [{"src": file.filename, "t": t, "v": embed(t)} for t in parts]
    p["knowledge"].append(dict(name=file.filename, chunks=len(parts)))
    put(pid, r["ver"], "draft", p, None, chunks); return out(latest(pid))

