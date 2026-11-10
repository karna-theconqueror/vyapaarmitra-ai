"""VyapaarMitra AI — FastAPI backend."""

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app import models  # noqa: F401  (registers tables with the metadata)
from app.database import Base, SessionLocal, engine
from app.routers import (
    advisor,
    customers,
    dashboard,
    data,
    merchant,
    products,
    sales,
    stock,
    voice,
)
from app.seed import seed_if_empty


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seeded = seed_if_empty(db)
        if seeded:
            print("[startup] seeded demo shop: Sri Balaji Kirana (demo data)")
    finally:
        db.close()
    yield


app = FastAPI(
    title="VyapaarMitra AI API",
    description="Decision-support API for small Indian merchants. Estimates only.",
    version="0.1.0",
    lifespan=lifespan,
)

# Dev origins plus any extras from the environment, e.g.
#   set CORS_ORIGINS=https://vyapaarmitra.vercel.app,https://myapp.vercel.app
_DEFAULT_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5180",
    "http://127.0.0.1:5180",
]
_extra_origins = [
    o.strip()
    for o in os.getenv("CORS_ORIGINS", "").split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_DEFAULT_ORIGINS + _extra_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for router_module in (
    merchant,
    products,
    sales,
    stock,
    customers,
    advisor,
    dashboard,
    data,
    voice,
):
    app.include_router(router_module.router)


@app.get("/api/health")
@app.get("/health")  # alias for load balancers / uptime probes
def health():
    return {"status": "ok", "service": "vyapaarmitra-api"}


# --- Static frontend (single-service production deploy) ----------------------
# Render's build command runs `npm run build`, so the built SPA sits in
# frontend/dist and this API serves it from the same origin: one URL, `/api`
# needs no CORS and the frontend needs no VITE_API_BASE. In dev the Vite
# server serves the UI instead and nothing here is hit.
FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"


def _serve_spa(full_path: str):
    index = FRONTEND_DIST / "index.html"
    if not index.is_file():
        raise HTTPException(status_code=404, detail="Frontend not built.")
    if full_path:
        # Never serve a file outside dist/ (path traversal).
        candidate = (FRONTEND_DIST / full_path).resolve()
        if candidate.is_file() and candidate.is_relative_to(FRONTEND_DIST.resolve()):
            return FileResponse(candidate)
        # A dotted path is a missing asset, not a client-side route.
        if "." in Path(full_path).name:
            raise HTTPException(status_code=404, detail="Not found.")
    return FileResponse(index)


if (FRONTEND_DIST / "index.html").is_file():
    # Registered last so /api/*, /docs and /health keep priority.
    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found.")
        return _serve_spa(full_path)
