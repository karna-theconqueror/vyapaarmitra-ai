from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_merchant
from app.models import Customer, FollowUp, Merchant
from app.schemas import (
    CustomerCreate,
    CustomerOut,
    CustomerUpdate,
    FollowUpComplete,
    FollowUpCreate,
    FollowUpOut,
    FollowUpUpdate,
)

router = APIRouter(prefix="/api", tags=["customers"])

DEFAULT_MESSAGE = (
    "Namaste! This is a gentle reminder from your shop — "
    "we would be happy to help with your next order. Thank you!"
)


def _follow_up_out(follow_up: FollowUp, customer: Customer) -> dict:
    out = FollowUpOut.model_validate(follow_up).model_dump()
    out["customer_name"] = customer.name
    out["customer_contact"] = customer.contact
    out["overdue"] = follow_up.status == "due" and follow_up.due_date < date.today()
    return out


# --- Customers ----------------------------------------------------------------
@router.get("/customers", response_model=list[CustomerOut])
def list_customers(
    db: Session = Depends(get_db),
    merchant: Merchant = Depends(get_current_merchant),
):
    return db.scalars(
        select(Customer)
        .where(Customer.merchant_id == merchant.id)
        .order_by(Customer.name)
    ).all()


@router.post("/customers", response_model=CustomerOut, status_code=201)
def create_customer(
    payload: CustomerCreate,
    db: Session = Depends(get_db),
    merchant: Merchant = Depends(get_current_merchant),
):
    customer = Customer(merchant_id=merchant.id, **payload.model_dump())
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


@router.put("/customers/{customer_id}", response_model=CustomerOut)
def update_customer(
    customer_id: int,
    payload: CustomerUpdate,
    db: Session = Depends(get_db),
    merchant: Merchant = Depends(get_current_merchant),
):
    customer = db.get(Customer, customer_id)
    if customer is None or customer.merchant_id != merchant.id:
        raise HTTPException(status_code=404, detail="Customer not found.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(customer, field, value)
    db.commit()
    db.refresh(customer)
    return customer


@router.delete("/customers/{customer_id}", status_code=204)
def delete_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    merchant: Merchant = Depends(get_current_merchant),
):
    customer = db.get(Customer, customer_id)
    if customer is None or customer.merchant_id != merchant.id:
        raise HTTPException(status_code=404, detail="Customer not found.")
    db.execute(delete(FollowUp).where(FollowUp.customer_id == customer.id))
    db.delete(customer)
    db.commit()


# --- Follow-ups ---------------------------------------------------------------
@router.get("/followups")
def list_followups(
    status: str = Query(default="due", pattern="^(due|done|all)$"),
    db: Session = Depends(get_db),
    merchant: Merchant = Depends(get_current_merchant),
):
    stmt = (
        select(FollowUp, Customer)
        .join(Customer, FollowUp.customer_id == Customer.id)
        .where(Customer.merchant_id == merchant.id)
        .order_by(FollowUp.due_date)
    )
    if status != "all":
        stmt = stmt.where(FollowUp.status == status)
    rows = db.execute(stmt).all()
    return [_follow_up_out(f, c) for f, c in rows]


@router.post("/followups", response_model=FollowUpOut, status_code=201)
def create_followup(
    payload: FollowUpCreate,
    db: Session = Depends(get_db),
    merchant: Merchant = Depends(get_current_merchant),
):
    customer = db.get(Customer, payload.customer_id)
    if customer is None or customer.merchant_id != merchant.id:
        raise HTTPException(status_code=404, detail="Customer not found.")
    follow_up = FollowUp(
        customer_id=customer.id,
        due_date=payload.due_date,
        message=payload.message or DEFAULT_MESSAGE,
    )
    db.add(follow_up)
    db.commit()
    db.refresh(follow_up)
    return _follow_up_out(follow_up, customer)


@router.put("/followups/{follow_up_id}", response_model=FollowUpOut)
def update_followup(
    follow_up_id: int,
    payload: FollowUpUpdate,
    db: Session = Depends(get_db),
    merchant: Merchant = Depends(get_current_merchant),
):
    follow_up = db.get(FollowUp, follow_up_id)
    if follow_up is None:
        raise HTTPException(status_code=404, detail="Follow-up not found.")
    customer = follow_up.customer
    if customer.merchant_id != merchant.id:
        raise HTTPException(status_code=404, detail="Follow-up not found.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(follow_up, field, value)
    if payload.status == "done" and follow_up.completed_at is None:
        follow_up.completed_at = datetime.now()
    db.commit()
    db.refresh(follow_up)
    return _follow_up_out(follow_up, customer)


@router.post("/followups/{follow_up_id}/complete", response_model=FollowUpOut)
def complete_followup(
    follow_up_id: int,
    payload: FollowUpComplete,
    db: Session = Depends(get_db),
    merchant: Merchant = Depends(get_current_merchant),
):
    follow_up = db.get(FollowUp, follow_up_id)
    if follow_up is None:
        raise HTTPException(status_code=404, detail="Follow-up not found.")
    customer = follow_up.customer
    if customer.merchant_id != merchant.id:
        raise HTTPException(status_code=404, detail="Follow-up not found.")
    if follow_up.status == "done":
        raise HTTPException(status_code=409, detail="Already marked complete.")
    follow_up.status = "done"
    follow_up.outcome_note = payload.outcome_note
    follow_up.completed_at = datetime.now()
    db.commit()
    db.refresh(follow_up)
    return _follow_up_out(follow_up, customer)
