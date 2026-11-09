from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_merchant, get_product_or_404
from app.models import Merchant, Product, StockMovement
from app.schemas import StockAdjust, StockMovementOut
from app.services.stock import apply_stock_change, stock_alerts

router = APIRouter(prefix="/api/stock", tags=["stock"])


@router.get("/alerts")
def low_stock_alerts(
    db: Session = Depends(get_db),
    merchant: Merchant = Depends(get_current_merchant),
):
    alerts = stock_alerts(db, merchant.id)
    return {
        "count": len(alerts),
        "alerts": alerts,
        "note": "Alerts use your own minimum threshold. No demand forecasting.",
    }


@router.post("/adjust")
def adjust_stock(
    payload: StockAdjust,
    db: Session = Depends(get_db),
    merchant: Merchant = Depends(get_current_merchant),
):
    if payload.quantity_change == 0:
        raise HTTPException(status_code=422, detail="Quantity change cannot be zero.")
    product = get_product_or_404(db, payload.product_id, merchant.id)
    apply_stock_change(db, product, payload.quantity_change, payload.reason)
    db.commit()
    db.refresh(product)
    return {
        "product_id": product.id,
        "name": product.name,
        "quantity": product.quantity,
        "min_threshold": product.min_threshold,
        "message": f"{product.name} updated to {product.quantity} {product.unit}(s).",
    }


@router.get("/movements", response_model=list[StockMovementOut])
def list_movements(
    limit: int = Query(default=30, ge=1, le=200),
    db: Session = Depends(get_db),
    merchant: Merchant = Depends(get_current_merchant),
):
    pairs = db.execute(
        select(StockMovement, Product)
        .join(Product, StockMovement.product_id == Product.id)
        .where(Product.merchant_id == merchant.id)
        .order_by(StockMovement.id.desc())
        .limit(limit)
    ).all()
    out = []
    for movement, product in pairs:
        item = StockMovementOut.model_validate(movement).model_dump()
        item["product_name"] = product.name
        out.append(item)
    return out
