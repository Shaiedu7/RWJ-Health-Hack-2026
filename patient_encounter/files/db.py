import os, json, uuid, sqlite3
from fastapi import HTTPException

# ---------- storage ----------
db = sqlite3.connect("studio.db", check_same_thread=False); db.row_factory = sqlite3.Row
db.execute("create table if not exists p(pid text, ver int, status text, profile text, issues text, chunks text, primary key(pid,ver))")
os.makedirs("uploads", exist_ok=True)
def latest(pid, published=False):
    q = "select * from p where pid=? " + ("and status='published' " if published else "") + "order by ver desc limit 1"
    r = db.execute(q, (pid,)).fetchone()
    if not r: raise HTTPException(404, "Patient not found")
    return r
def put(pid, ver, status, prof, issues=None, chunks=()):
    db.execute("insert or replace into p values(?,?,?,?,?,?)",
               (pid, ver, status, json.dumps(prof), json.dumps(issues), json.dumps(list(chunks)))); db.commit()
def out(r):
    return dict(pid=r["pid"], ver=r["ver"], status=r["status"], profile=json.loads(r["profile"]), issues=json.loads(r["issues"]))
def draft(pid):  # editing a published patient forks a new draft version (published rows stay immutable)
    r = latest(pid)
    if r["status"] in ("published", "archived"):
        put(pid, r["ver"] + 1, "draft", json.loads(r["profile"]), None, json.loads(r["chunks"])); r = latest(pid)
    return r
def ids(p):
    for it in p["clinical"]["vitals"] + p["clinical"]["exam"] + p["artifacts"]: it["id"] = it.get("id") or uuid.uuid4().hex[:8]
    return p

