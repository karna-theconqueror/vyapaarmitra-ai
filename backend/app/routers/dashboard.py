from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_merchant
from app.models import Customer, FollowUp, Merchant
from app.schemas import MerchantOut
from app.services import profit as profit_service
from app.services.advisor import daily_brief
from app.services.stock import stock_alerts

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("")
def dashboard(
    db: Session = Depends(get_db),
    merchant: Merchant = Depends(get_current_merchant),
):
    """One-shot snapshot for the main dashboard (fewer round trips for the demo)."""
    alerts = stock_alerts(db, merchant.id)

    due_count = db.scalar(
        select(func.count(FollowUp.id))
        .join(Customer, FollowUp.customer_id == Customer.id)
        .where(Customer.merchant_id == merchant.id, FollowUp.status == "due")
    )

    return {
        "merchant": MerchantOut.model_validate(merchant).model_dump(),
        "summary": profit_service.daily_summary(db, merchant.id),
        "low_stock": {"count": len(alerts), "top": alerts[:4]},
        "advisor": daily_brief(db, merchant.id, merchant.shop_name),
        "due_followup_count": due_count or 0,
    }
