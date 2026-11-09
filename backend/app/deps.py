from fastapi import Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Merchant


def get_current_merchant(db: Session = Depends(get_db)) -> Merchant:
    """Single-shop demo: the first merchant is the active shop profile."""
    merchant = db.scalars(select(Merchant).order_by(Merchant.id)).first()
    if merchant is None:
        raise HTTPException(
            status_code=404,
            detail="No shop profile yet. Create one with POST /api/merchant.",
        )
    return merchant


def get_product_or_404(db: Session, product_id: int, merchant_id: int):
    from app.models import Product

    product = db.get(Product, product_id)
    if product is None or product.merchant_id != merchant_id:
        raise HTTPException(status_code=404, detail="Product not found.")
    return product
