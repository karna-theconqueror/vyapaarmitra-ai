from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Merchant, StockMovement
from app.schemas import MerchantCreate, MerchantOut
from app.services.stock import apply_stock_change

router = APIRouter(prefix="/api/merchant", tags=["merchant"])


@router.get("", response_model=MerchantOut | None)
def read_merchant(db: Session = Depends(get_db)):
    """Current shop profile, or null when onboarding has not been completed."""
    return db.scalars(select(Merchant).order_by(Merchant.id)).first()


@router.post("", response_model=MerchantOut, status_code=201)
def create_merchant(payload: MerchantCreate, db: Session = Depends(get_db)):
    existing = db.scalars(select(Merchant).order_by(Merchant.id)).first()
    if existing:
        raise HTTPException(status_code=409, detail="A shop profile already exists.")
    merchant = Merchant(**payload.model_dump())
    db.add(merchant)
    db.commit()
    db.refresh(merchant)
    return merchant


@router.put("", response_model=MerchantOut)
def update_merchant(payload: MerchantCreate, db: Session = Depends(get_db)):
    merchant = db.scalars(select(Merchant).order_by(Merchant.id)).first()
    if merchant is None:
        raise HTTPException(status_code=404, detail="No shop profile yet.")
    for field, value in payload.model_dump().items():
        setattr(merchant, field, value)
    db.commit()
    db.refresh(merchant)
    return merchant


@router.post("/demo-products", status_code=201)
def load_demo_products(db: Session = Depends(get_db)):
    """Quick-start helper: add the seeded demo catalogue to an empty shop."""
    from app.seed import DEMO_PRODUCTS, seed_if_empty

    merchant = db.scalars(select(Merchant).order_by(Merchant.id)).first()
    if merchant is None:
        raise HTTPException(status_code=404, detail="Create a shop profile first.")

    from app.models import Product

    if db.scalars(select(Product).where(Product.merchant_id == merchant.id)).first():
        raise HTTPException(status_code=409, detail="Products already exist.")

    created = []
    for key, name, unit, cost, price, opening, min_threshold, target in DEMO_PRODUCTS:
        product = Product(
            merchant_id=merchant.id,
            name=name,
            unit=unit,
            purchase_cost=cost,
            selling_price=price,
            quantity=opening,
            min_threshold=min_threshold,
            target_stock=target,
        )
        db.add(product)
        db.flush()
        db.add(
            StockMovement(
                product_id=product.id,
                quantity_change=opening,
                reason="Opening stock (demo)",
            )
        )
        created.append({"key": key, "name": name})
    db.commit()
    return {"created": created, "note": "Demo data — not real merchant outcomes."}
