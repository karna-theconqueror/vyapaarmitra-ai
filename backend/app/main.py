"""VyapaarMitra AI — FastAPI backend."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5180",
        "http://127.0.0.1:5180",
    ],
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
):
    app.include_router(router_module.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "vyapaarmitra-api"}
