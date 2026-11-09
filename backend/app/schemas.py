from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- Merchant -----------------------------------------------------------------
class MerchantCreate(BaseModel):
    shop_name: str = Field(min_length=1, max_length=120)
    business_type: str = Field(default="Kirana store", max_length=60)
    owner_name: str | None = Field(default=None, max_length=120)
    language: str = Field(default="English", max_length=20)


class MerchantOut(ORMModel):
    id: int
    shop_name: str
    business_type: str
    owner_name: str | None
    language: str
    created_at: datetime


# --- Product ------------------------------------------------------------------
class ProductCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    unit: str = Field(default="unit", max_length=30)
    purchase_cost: float | None = Field(default=None, ge=0)
    selling_price: float | None = Field(default=None, ge=0)
    quantity: int = Field(default=0, ge=0)
    min_threshold: int = Field(default=5, ge=0)
    target_stock: int | None = Field(default=None, ge=0)


class ProductUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    unit: str | None = Field(default=None, max_length=30)
    purchase_cost: float | None = Field(default=None, ge=0)
    selling_price: float | None = Field(default=None, ge=0)
    quantity: int | None = Field(default=None, ge=0)
    min_threshold: int | None = Field(default=None, ge=0)
    target_stock: int | None = Field(default=None, ge=0)


class ProductOut(ORMModel):
    id: int
    merchant_id: int
    name: str
    unit: str
    purchase_cost: float | None
    selling_price: float | None
    quantity: int
    min_threshold: int
    target_stock: int | None


# --- Sale ---------------------------------------------------------------------
class SaleCreate(BaseModel):
    product_id: int
    quantity: int = Field(gt=0)
    unit_price: float | None = Field(default=None, ge=0)
    sale_date: date | None = None
    note: str | None = Field(default=None, max_length=255)


class SaleOut(ORMModel):
    id: int
    merchant_id: int
    product_id: int
    quantity: int
    unit_price: float
    sale_date: date
    note: str | None


# --- Stock --------------------------------------------------------------------
class StockAdjust(BaseModel):
    product_id: int
    quantity_change: int
    reason: str = Field(default="manual", max_length=60)


class StockMovementOut(ORMModel):
    id: int
    product_id: int
    quantity_change: int
    reason: str
    created_at: datetime
    product_name: str | None = None


# --- Customer / Follow-up -----------------------------------------------------
class CustomerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    contact: str | None = Field(default=None, max_length=60)
    purchase_note: str | None = None


class CustomerUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    contact: str | None = Field(default=None, max_length=60)
    purchase_note: str | None = None


class CustomerOut(ORMModel):
    id: int
    merchant_id: int
    name: str
    contact: str | None
    purchase_note: str | None


class FollowUpCreate(BaseModel):
    customer_id: int
    due_date: date
    message: str | None = None


class FollowUpUpdate(BaseModel):
    due_date: date | None = None
    message: str | None = None
    status: str | None = Field(default=None, pattern="^(due|done)$")


class FollowUpComplete(BaseModel):
    outcome_note: str | None = None


class FollowUpOut(ORMModel):
    id: int
    customer_id: int
    due_date: date
    status: str
    message: str | None
    outcome_note: str | None
    completed_at: datetime | None
    customer_name: str | None = None
    customer_contact: str | None = None
    overdue: bool = False
