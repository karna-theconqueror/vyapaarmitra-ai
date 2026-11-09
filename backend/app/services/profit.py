"""ProfitGuard calculations.

All arithmetic here is deterministic and traceable. Every number returned is an
estimate based on information entered or confirmed by the merchant.
"""

from collections import defaultdict
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Product, Sale

# Margin below this percentage is flagged for review (merchant can still ignore).
WEAK_MARGIN_PCT = 10.0


def gross_profit(purchase_cost: float | None, selling_price: float | None, quantity: int) -> float | None:
    if purchase_cost is None or selling_price is None:
        return None
    return round((selling_price - purchase_cost) * quantity, 2)


def gross_margin_pct(purchase_cost: float | None, selling_price: float | None) -> float | None:
    """Gross margin as a percentage of selling price. None when not computable."""
    if purchase_cost is None or selling_price is None or selling_price <= 0:
        return None
    return round(((selling_price - purchase_cost) / selling_price) * 100, 1)


def margin_status(purchase_cost: float | None, selling_price: float | None) -> str:
    pct = gross_margin_pct(purchase_cost, selling_price)
    if pct is None:
        return "unknown"
    if pct < 0:
        return "negative"
    if pct < WEAK_MARGIN_PCT:
        return "weak"
    return "healthy"


def product_profit_rows(db: Session, merchant_id: int) -> list[dict]:
    """One row per product: entered values + estimated profit/margin + units sold."""
    products = db.scalars(
        select(Product).where(Product.merchant_id == merchant_id).order_by(Product.name)
    ).all()
    sales = db.scalars(select(Sale).where(Sale.merchant_id == merchant_id)).all()

    units_sold: dict[int, int] = defaultdict(int)
    revenue: dict[int, float] = defaultdict(float)
    for sale in sales:
        units_sold[sale.product_id] += sale.quantity
        revenue[sale.product_id] += sale.unit_price * sale.quantity

    rows = []
    for p in products:
        sold = units_sold.get(p.id, 0)
        margin = gross_margin_pct(p.purchase_cost, p.selling_price)
        rows.append(
            {
                "id": p.id,
                "name": p.name,
                "unit": p.unit,
                "purchase_cost": p.purchase_cost,
                "selling_price": p.selling_price,
                "quantity": p.quantity,
                "min_threshold": p.min_threshold,
                "qty_sold": sold,
                "revenue": round(revenue.get(p.id, 0.0), 2),
                "estimated_gross_profit": gross_profit(p.purchase_cost, p.selling_price, sold),
                "gross_margin_pct": margin,
                "margin_status": margin_status(p.purchase_cost, p.selling_price),
                "missing_cost": p.purchase_cost is None,
                "missing_price": p.selling_price is None,
            }
        )
    return rows


def daily_summary(db: Session, merchant_id: int, day: date | None = None) -> dict:
    day = day or date.today()
    sales = db.scalars(
        select(Sale).where(Sale.merchant_id == merchant_id, Sale.sale_date == day)
    ).all()
    cost_by_product = {
        p.id: p.purchase_cost
        for p in db.scalars(select(Product).where(Product.merchant_id == merchant_id))
    }

    revenue = 0.0
    estimated_profit = 0.0
    profit_known = True
    for sale in sales:
        revenue += sale.unit_price * sale.quantity
        cost = cost_by_product.get(sale.product_id)
        if cost is None:
            profit_known = False
        else:
            estimated_profit += (sale.unit_price - cost) * sale.quantity

    rows = product_profit_rows(db, merchant_id)
    flagged = [r for r in rows if r["margin_status"] in ("negative", "weak")]

    return {
        "date": day.isoformat(),
        "sales_count": len(sales),
        "units_sold": sum(s.quantity for s in sales),
        "revenue": round(revenue, 2),
        "estimated_gross_profit": round(estimated_profit, 2) if profit_known else None,
        "profit_is_estimate": True,
        "products_listed": len(rows),
        "flagged_margin_count": len(flagged),
        "note": "Estimate only — based on entered cost, price and quantity. Not audited profit.",
    }


def low_margin_rows(rows: list[dict]) -> list[dict]:
    return [r for r in rows if r["margin_status"] in ("negative", "weak")]
