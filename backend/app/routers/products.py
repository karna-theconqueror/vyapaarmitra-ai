from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_merchant, get_product_or_404
from app.models import Merchant, Product, Sale, StockMovement
from app.schemas import ProductCreate, ProductOut, ProductUpdate
from app.services.stock import apply_stock_change

router = APIRouter(prefix="/api/products", tags=["products"])


@router.get("", response_model=list[ProductOut])
def list_products(
    db: Session = Depends(get_db),
    merchant: Merchant = Depends(get_current_merchant),
):
    return db.scalars(
        select(Product)
        .where(Product.merchant_id == merchant.id)
        .order_by(Product.name)
    ).all()


@router.post("", response_model=ProductOut, status_code=201)
def create_product(
    payload: ProductCreate,
    db: Session = Depends(get_db),
    merchant: Merchant = Depends(get_current_merchant),
):
    product = Product(merchant_id=merchant.id, **payload.model_dump())
    db.add(product)
    db.flush()
    if product.quantity:
        db.add(
            StockMovement(
                product_id=product.id,
                quantity_change=product.quantity,
                reason="Opening stock",
            )
        )
    db.commit()
    db.refresh(product)
    return product


@router.put("/{product_id}", response_model=ProductOut)
def update_product(
    product_id: int,
    payload: ProductUpdate,
    db: Session = Depends(get_db),
    merchant: Merchant = Depends(get_current_merchant),
):
    product = get_product_or_404(db, product_id, merchant.id)
    changes = payload.model_dump(exclude_unset=True)
    old_qty = product.quantity
    qty_delta = None
    if "quantity" in changes and changes["quantity"] != old_qty:
        qty_delta = changes["quantity"] - old_qty
    for field, value in changes.items():
        setattr(product, field, value)
    if qty_delta is not None:
        product.quantity = old_qty  # apply through the movement-aware helper
        apply_stock_change(db, product, qty_delta, "Manual correction")
    db.commit()
    db.refresh(product)
    return product


@router.delete("/{product_id}", status_code=204)
def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
    merchant: Merchant = Depends(get_current_merchant),
):
    product = get_product_or_404(db, product_id, merchant.id)
    db.execute(delete(Sale).where(Sale.product_id == product.id))
    db.execute(delete(StockMovement).where(StockMovement.product_id == product.id))
    db.delete(product)
    db.commit()
