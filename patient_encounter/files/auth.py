import os, time, hashlib, secrets
from typing import Literal
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from db import db

router = APIRouter()
# ---------- auth: faculty vs student roles ----------
FACULTY_CODE = os.getenv("FACULTY_CODE", "faculty-demo")  # needed to self-register as faculty
db.execute("create table if not exists users(email text primary key, name text, role text, salt text, pw text)")
db.execute("create table if not exists sessions(token text primary key, email text, exp real)")
def hpw(pw, salt): return hashlib.pbkdf2_hmac("sha256", pw.encode(), bytes.fromhex(salt), 120_000).hex()
class Reg(BaseModel): email: str; password: str; name: str = ""; role: Literal["faculty", "student"] = "student"; code: str = ""
class Login(BaseModel): email: str; password: str
def start_session(u):
    t = secrets.token_urlsafe(32); db.execute("insert into sessions values(?,?,?)", (t, u["email"], time.time() + 86400)); db.commit()
    return {"token": t, "user": {"email": u["email"], "name": u["name"], "role": u["role"]}}

@router.post("/api/auth/register")
def register(b: Reg):
    e = b.email.strip().lower()
    if "@" not in e or len(b.password) < 8: raise HTTPException(422, "Use a valid email and a password of at least 8 characters.")
    if b.role == "faculty" and b.code != FACULTY_CODE: raise HTTPException(403, "Incorrect faculty access code.")
    if db.execute("select 1 from users where email=?", (e,)).fetchone(): raise HTTPException(409, "An account with this email already exists.")
    salt = secrets.token_hex(16); db.execute("insert into users values(?,?,?,?,?)", (e, b.name or e, b.role, salt, hpw(b.password, salt))); db.commit()
    return start_session(db.execute("select * from users where email=?", (e,)).fetchone())

@router.post("/api/auth/login")
def login(b: Login):
    u = db.execute("select * from users where email=?", (b.email.strip().lower(),)).fetchone()
    if not u or not secrets.compare_digest(u["pw"], hpw(b.password, u["salt"])): raise HTTPException(401, "Email or password is incorrect.")
    return start_session(u)

@router.get("/api/auth/me")
def me(request: Request): u = request.state.user; return {"email": u["email"], "name": u["name"], "role": u["role"]}

@router.post("/api/auth/logout")
def logout(request: Request):
    db.execute("delete from sessions where token=?", (request.headers.get("authorization", "").removeprefix("Bearer "),)); db.commit(); return {}

async def guard(request: Request, call_next):
    path = request.url.path
    if not path.startswith("/api") or path in ("/api/auth/register", "/api/auth/login"): return await call_next(request)
    t = request.headers.get("authorization", "").removeprefix("Bearer ")
    u = db.execute("select users.* from sessions join users on users.email=sessions.email where token=? and exp>?", (t, time.time())).fetchone()
    if not u: return JSONResponse({"detail": "Sign in required."}, 401)
    request.state.user = dict(u)
    student_ok = path.startswith("/api/encounter") or path.startswith("/api/auth/") or (path == "/api/patients" and request.method == "GET")
    if u["role"] != "faculty" and not student_ok: return JSONResponse({"detail": "Faculty access only."}, 403)
    return await call_next(request)

