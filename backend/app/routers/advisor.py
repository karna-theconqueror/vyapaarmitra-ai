from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_merchant
from app.models import Merchant
from app.services.advisor import daily_brief

router = APIRouter(prefix="/api/advisor", tags=["advisor"])


@router.get("/daily-brief")
def get_daily_brief(
    db: Session = Depends(get_db),
    merchant: Merchant = Depends(get_current_merchant),
):
    """Unified AI Business Advisor — combines module signals into one brief."""
    return daily_brief(db, merchant.id, merchant.shop_name)
