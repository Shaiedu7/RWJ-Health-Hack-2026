import json
from fastapi import APIRouter
from pydantic import BaseModel
from db import latest
from llm import MODEL, FAST, br, tool_call, retrieve

router = APIRouter(prefix="/api/encounter")
GATED = ("topic_asked", "exam_requested", "custom_intent")

def groups(p): return [("vitals", p["clinical"]["vitals"]), ("exam", p["clinical"]["exam"]), ("artifacts", p["artifacts"])]
def pub(i): return {k: v for k, v in i.items() if k != "trigger"}  # never send the release rule to students

def release(p, message, turn, unlocked):
    """Which still-locked items does this student turn release? Shared by the live encounter and the Studio trigger tester."""
    gated = [(g, i) for g, items in groups(p) for i in items if i["id"] not in unlocked and i["trigger"]["type"] != "start"]
    hit = {i["id"]: f"after {i['trigger']['value']} turns" for g, i in gated
           if i["trigger"]["type"] == "after_turns" and i["trigger"].get("value", "").isdigit() and turn >= int(i["trigger"]["value"])}
    cand = [{"id": i["id"], "when": i["trigger"]} for g, i in gated if i["trigger"]["type"] in GATED and i["id"] not in hit]
    if cand and message.strip():
        f = tool_call(FAST, "Return the ids of locked items whose release condition the student's latest message satisfies (asked about the topic / requested the exam or test / matches the intent). Be strict.",
            [{"text": json.dumps({"message": message, "locked": cand})}], "fired",
            {"type": "object", "required": ["ids"], "properties": {"ids": {"type": "array", "items": {"type": "string"}}}})
        for c in cand:
            if c["id"] in f["ids"]: hit[c["id"]] = f"{c['when']['type'].replace('_', ' ')}: {c['when'].get('value', '')}"
    return [dict(group=g, item=i, reason=hit[i["id"]]) for g, i in gated if i["id"] in hit]

@router.get("/{pid}")
def enc(pid: str):  # student view: only items available at start; locked content never leaves the server
    p = json.loads(latest(pid, True)["profile"]); g = {k: [pub(i) for i in items if i["trigger"]["type"] == "start"] for k, items in groups(p)}
    return dict(persona=p["demographics"], chief_complaint=p["overview"]["chief_complaint"], **g)

class Turn(BaseModel): history: list[dict]; message: str; turn: int; unlocked: list[str]
@router.post("/{pid}/turn")
def turn(pid: str, b: Turn):
    r = latest(pid, True); p = json.loads(r["profile"]); c = p["clinical"]; chunks = json.loads(r["chunks"])
    rel = release(p, b.message, b.turn, b.unlocked)
    d, ps, ds = p["demographics"], p["psychosocial"], p["disclosure"]
    facts = {k: p[k] for k in ("demographics", "medications", "nutrition", "psychosocial")} | {"chief_complaint": p["overview"]["chief_complaint"],
        "clinical": {k: v for k, v in c.items() if k not in ("vitals", "exam", "hidden_diagnosis", "differentials")}}
    sys = (f"You are {d['name']}, a patient in a clinic visit with a medical student. Personality: {ps['personality']}. Communication style: {ps['communication_style']}. "
      f"Health literacy: {ps['health_literacy']}; use lay language only. Reply in 1-3 spoken sentences, in character, never as an AI. Opening statement if the student greets you: {ds['opening_statement']}\n"
      f"Facts about you: {json.dumps(facts)}\nDisclosure rules (volunteer = say early; if_asked = only when directly asked; only_if_probed = after repeated gentle probing): {json.dumps(ds['rules'])}\n"
      f"Concerns you hide unless trust is built: {ds['hidden_concerns']}\nYou do NOT know your diagnosis ({c['hidden_diagnosis']}) and must never state it. Don't invent test results; say you don't know.\n"
      + ("Reference material:\n" + "\n".join(retrieve(chunks, b.message)) if chunks else ""))
    msgs = [{"role": "user" if m["role"] == "student" else "assistant", "content": [{"text": m["content"]}]} for m in b.history] + [{"role": "user", "content": [{"text": b.message}]}]
    rr = br.converse(modelId=MODEL, system=[{"text": sys}], messages=msgs)
    new = [x["item"]["id"] for x in rel]
    return dict(reply=rr["output"]["message"]["content"][0]["text"], new=new, unlocked=b.unlocked + new,
                revealed=[dict(group=x["group"], item=pub(x["item"]), reason=x["reason"]) for x in rel])
