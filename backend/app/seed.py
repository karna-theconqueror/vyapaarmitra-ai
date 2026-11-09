"""Seeded demo shop data.

Everything here is demo data — clearly labelled as such in the UI. Quantities
stay internally consistent: opening stock minus recorded sales equals the
quantity shown on the product.
"""

from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Customer, FollowUp, Merchant, Product, Sale, StockMovement

# (key, name, unit, cost, price, opening_qty, min_threshold, target_stock)
DEMO_PRODUCTS = [
    ("tea", "Tea 500g", "packet", 120.0, 145.0, 40, 8, 60),
    ("oil", "Cooking oil 1L", "bottle", 138.0, 150.0, 9, 6, 30),
    ("biscuits", "Brand A biscuits", "pack", 10.0, 10.0, 80, 20, 100),
    ("sugar", "Sugar 1kg", "kg", 42.0, 46.0, 30, 10, 50),
    ("milk", "Milk 500ml", "packet", 27.0, 30.0, 20, 10, 40),
    ("notebook", "Notebook 120 pages", "piece", 28.0, 40.0, 45, 10, 60),
    ("pen", "Ball pen", "piece", 3.0, 5.0, 140, 30, 200),
    ("detergent", "Detergent 1kg", "pack", 88.0, 110.0, 15, 5, 25),
    ("coffee", "Instant coffee 100g", "jar", 190.0, 185.0, 10, 3, 15),
]

# (days_ago, product_key, quantity, unit_price)
DEMO_SALES = [
    (0, "tea", 6, 145.0),
    (0, "milk", 8, 30.0),
    (0, "biscuits", 20, 10.0),
    (0, "sugar", 4, 46.0),
    (1, "oil", 3, 150.0),
    (1, "notebook", 5, 40.0),
    (1, "pen", 12, 5.0),
    (1, "tea", 4, 145.0),
    (2, "detergent", 2, 110.0),
    (2, "coffee", 3, 185.0),
    (2, "milk", 10, 30.0),
]

# (name, contact, purchase_note)
DEMO_CUSTOMERS = [
    ("Lakshmi", "98xxxxxx21", "Buys milk and bread most mornings"),
    ("Gupta ji", "97xxxxxx08", "Bulk sugar and flour on the 1st of each month"),
    ("Anil (stationery)", "96xxxxxx44", "Buys notebooks for tuition batch"),
]

# (customer_key, days_from_today, status, message, outcome_note)
DEMO_FOLLOWUPS = [
    (0, 0, "due", "Namaste Lakshmi ji — your usual milk is freshly stocked. Shall we keep 2 packets aside for tomorrow?", None),
    (1, -2, "due", "Namaste Gupta ji — monthly ration lists are ready. Would you like the usual sugar and flour set?", None),
    (2, 3, "due", "Hello Anil — new notebook stock has arrived in both ruled and plain. Feel free to visit.", None),
    (0, -5, "done", "Namaste Lakshmi ji — thank you for your repeat order!", "Confirmed weekly milk standing order"),
]


def seed_if_empty(db: Session) -> bool:
    """Create the demo shop when the database has no merchants. Idempotent."""
    if db.scalars(select(Merchant).limit(1)).first():
        return False

    merchant = Merchant(
        shop_name="Sri Balaji Kirana",
        business_type="Kirana store",
        owner_name="Ramesh",
        language="English",
    )
    db.add(merchant)
    db.flush()

    products: dict[str, Product] = {}
    sold: dict[str, int] = {}
    for key, name, unit, cost, price, opening, min_threshold, target in DEMO_PRODUCTS:
        product = Product(
            merchant_id=merchant.id,
            name=name,
            unit=unit,
            purchase_cost=cost,
            selling_price=price,
            quantity=opening,
            min_threshold=min_threshold,
            target_stock=target,
        )
        db.add(product)
        db.flush()
        products[key] = product
        sold[key] = 0
        db.add(
            StockMovement(
                product_id=product.id,
                quantity_change=opening,
                reason="Opening stock (demo)",
            )
        )

    today = date.today()
    for days_ago, key, qty, price in DEMO_SALES:
        product = products[key]
        sold[key] += qty
        db.add(
            Sale(
                merchant_id=merchant.id,
                product_id=product.id,
                quantity=qty,
                unit_price=price,
                sale_date=today - timedelta(days=days_ago),
                note="Demo sale",
            )
        )
        db.add(
            StockMovement(
                product_id=product.id,
                quantity_change=-qty,
                reason="Sale (demo)",
            )
        )

    for key, product in products.items():
        product.quantity = max(product.quantity - sold[key], 0)

    customers: list[Customer] = []
    for name, contact, note in DEMO_CUSTOMERS:
        customer = Customer(
            merchant_id=merchant.id,
            name=name,
            contact=contact,
            purchase_note=note,
        )
        db.add(customer)
        db.flush()
        customers.append(customer)

    for customer_idx, offset, status, message, outcome in DEMO_FOLLOWUPS:
        due = today + timedelta(days=offset)
        follow_up = FollowUp(
            customer_id=customers[customer_idx].id,
            due_date=due,
            status=status,
            message=message,
            outcome_note=outcome,
        )
        if status == "done":
            follow_up.completed_at = datetime.now()
        db.add(follow_up)

    db.commit()
    return True


def reset_and_seed(db: Session) -> None:
    from app.database import Base, engine

    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    seed_if_empty(db)
