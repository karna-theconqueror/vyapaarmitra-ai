from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_merchant, get_product_or_404
from app.models import Merchant, Product, Sale
from app.schemas import SaleCreate, SaleOut
from app.services import profit as profit_service
from app.services.stock import apply_stock_change

router = APIRouter(prefix="/api", tags=["sales"])


def _sale_with_product(sale: Sale) -> dict:
    out = SaleOut.model_validate(sale).model_dump()
    out["product_name"] = sale.product.name if sale.product else None
    return out


@router.get("/sales")
def list_sales(
    day: date | None = Query(default=None, description="Filter to one sale date"),
    db: Session = Depends(get_db),
    merchant: Merchant = Depends(get_current_merchant),
):
    stmt = select(Sale).where(Sale.merchant_id == merchant.id)
    if day:
        stmt = stmt.where(Sale.sale_date == day)
    sales = db.scalars(stmt.order_by(Sale.sale_date.desc(), Sale.id.desc())).all()
    return [_sale_with_product(s) for s in sales]


@router.post("/sales", response_model=SaleOut, status_code=201)
def create_sale(
    payload: SaleCreate,
    db: Session = Depends(get_db),
    merchant: Merchant = Depends(get_current_merchant),
):
    product = get_product_or_404(db, payload.product_id, merchant.id)

    unit_price = payload.unit_price
    if unit_price is None:
        if product.selling_price is None:
            raise HTTPException(
                status_code=422,
                detail="Enter a selling price for this sale — it is not set on the product.",
            )
        unit_price = product.selling_price

    sale = Sale(
        merchant_id=merchant.id,
        product_id=product.id,
        quantity=payload.quantity,
        unit_price=unit_price,
        sale_date=payload.sale_date or date.today(),
        note=payload.note,
    )
    db.add(sale)
    apply_stock_change(db, product, -payload.quantity, "Sale")
    db.commit()
    db.refresh(sale)
    return sale


@router.get("/profit/products")
def profit_by_product(
    db: Session = Depends(get_db),
    merchant: Merchant = Depends(get_current_merchant),
):
    """Product profitability table — estimates from entered values only."""
    rows = profit_service.product_profit_rows(db, merchant.id)
    return {
        "rows": rows,
        "flagged": profit_service.low_margin_rows(rows),
        "note": "Estimated gross profit = (selling price - purchase cost) × units sold.",
    }


@router.get("/profit/summary")
def profit_summary(
    day: date | None = Query(default=None),
    db: Session = Depends(get_db),
    merchant: Merchant = Depends(get_current_merchant),
):
    return profit_service.daily_summary(db, merchant.id, day)
