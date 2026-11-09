"""StockSense calculations.

Thresholds and quantities are merchant-set; nothing here forecasts demand or
places supplier orders.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Product


def _alert_level(quantity: int, threshold: int) -> str:
    if quantity <= 0:
        return "out_of_stock"
    if threshold > 0 and quantity <= threshold * 0.5:
        return "critical"
    return "low"


def stock_alerts(db: Session, merchant_id: int) -> list[dict]:
    """Products at or below the merchant-set minimum, most urgent first."""
    products = db.scalars(
        select(Product).where(Product.merchant_id == merchant_id)
    ).all()

    alerts = []
    for p in products:
        if p.quantity > p.min_threshold:
            continue
        ratio = (p.quantity / p.min_threshold) if p.min_threshold > 0 else 0.0
        suggested = None
        if p.target_stock is not None:
            suggested = max(p.target_stock - p.quantity, 0)
        alerts.append(
            {
                "product_id": p.id,
                "name": p.name,
                "unit": p.unit,
                "quantity": p.quantity,
                "min_threshold": p.min_threshold,
                "target_stock": p.target_stock,
                "suggested_reorder": suggested,
                "level": _alert_level(p.quantity, p.min_threshold),
                "urgency": round(ratio, 2),
                "explanation": (
                    f"{p.name} is {p.quantity} {p.unit}(s) — at or below your "
                    f"{p.min_threshold} alert level."
                ),
            }
        )

    order = {"out_of_stock": 0, "critical": 1, "low": 2}
    alerts.sort(key=lambda a: (order[a["level"]], a["urgency"]))
    return alerts


def apply_stock_change(db: Session, product: Product, change: int, reason: str) -> Product:
    """Apply a signed quantity change and record the movement."""
    from app.models import StockMovement

    new_qty = max(product.quantity + change, 0)
    product.quantity = new_qty
    db.add(StockMovement(product_id=product.id, quantity_change=change, reason=reason))
    db.flush()
    return product
