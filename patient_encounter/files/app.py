"""Run:  cd backend && pip install -r requirements.txt && uvicorn app:app --reload"""
from pathlib import Path
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
import auth, routes_studio, routes_encounter

app = FastAPI(title="Patient Studio")
app.middleware("http")(auth.guard)
for m in (auth, routes_studio, routes_encounter): app.include_router(m.router)
app.mount("/files", StaticFiles(directory="uploads"))

@app.get("/")
def root(): return FileResponse(Path(__file__).parent / "index.html")