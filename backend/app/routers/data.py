from datetime import date, datetime

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Customer, FollowUp, Merchant, Product, Sale, StockMovement
from app.seed import reset_and_seed

router = APIRouter(prefix="/api/data", tags=["data"])


def _dump(obj) -> dict:
    out = {}
    for column in obj.__table__.columns:
        value = getattr(obj, column.name)
        if isinstance(value, (datetime, date)):
            value = value.isoformat()
        out[column.name] = value
    return out


@router.get("/export")
def export_data(db: Session = Depends(get_db)):
    """Full JSON export of the demo shop's records (privacy control for settings)."""
    return {
        "exported_for": "VyapaarMitra AI demo",
        "merchants": [_dump(m) for m in db.scalars(select(Merchant)).all()],
        "products": [_dump(p) for p in db.scalars(select(Product)).all()],
        "sales": [_dump(s) for s in db.scalars(select(Sale)).all()],
        "stock_movements": [_dump(m) for m in db.scalars(select(StockMovement)).all()],
        "customers": [_dump(c) for c in db.scalars(select(Customer)).all()],
        "follow_ups": [_dump(f) for f in db.scalars(select(FollowUp)).all()],
        "note": "Demo data export. Sample data — not real merchant outcomes.",
    }


@router.post("/reset")
def reset_data(db: Session = Depends(get_db)):
    """Wipe everything and reload the seeded demo shop."""
    reset_and_seed(db)
    return {"status": "reset", "note": "Demo data restored."}
