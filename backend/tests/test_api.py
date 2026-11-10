"""API contract tests — mirrors the frozen endpoint table in README.md.

Every endpoint the team contract promises gets at least one assertion here,
plus the demo-seed invariants the UI depends on (4 sales / ₹1,494 / 9
products / 2 alerts / 3 due follow-ups).
"""

from datetime import date, timedelta

from sqlalchemy import delete

from app.database import SessionLocal
from app.models import Customer, FollowUp, Merchant, Product, Sale, StockMovement

TODAY = date.today()


# --- helpers -----------------------------------------------------------------
def _id_by_name(client, name: str) -> int:
    products = client.get("/api/products").json()
    return next(p["id"] for p in products if p["name"] == name)


def _clear_shop():
    """Remove every row so the fresh-shop flows (onboarding) can be tested."""
    db = SessionLocal()
    try:
        for model in (FollowUp, Customer, Sale, StockMovement, Product, Merchant):
            db.execute(delete(model))
        db.commit()
    finally:
        db.close()


# --- health ------------------------------------------------------------------
def test_health_and_alias(client):
    for path in ("/api/health", "/health"):
        body = client.get(path).json()
        assert body["status"] == "ok"
        assert body["service"] == "vyapaarmitra-api"


def test_cors_allows_dev_origin(client):
    r = client.get("/api/health", headers={"Origin": "http://localhost:5180"})
    assert r.headers.get("access-control-allow-origin") == "http://localhost:5180"


# --- merchant ----------------------------------------------------------------
def test_seed_merchant_is_the_demo_shop(client):
    merchant = client.get("/api/merchant").json()
    assert merchant["shop_name"] == "Sri Balaji Kirana"
    assert merchant["business_type"] == "Kirana store"


def test_post_merchant_conflicts_when_one_exists(client):
    r = client.post("/api/merchant", json={"shop_name": "Other Shop"})
    assert r.status_code == 409
    assert "already exists" in r.json()["detail"]


def test_put_merchant_updates_profile(client):
    r = client.put(
        "/api/merchant",
        json={"shop_name": "Sri Balaji Kirana", "owner_name": "Ramesh K"},
    )
    assert r.status_code == 200
    assert r.json()["owner_name"] == "Ramesh K"


def test_fresh_shop_onboarding_flow(client):
    _clear_shop()

    # nothing yet
    assert client.get("/api/merchant").json() is None
    assert client.get("/api/products").status_code == 404  # no shop profile

    # create profile
    r = client.post(
        "/api/merchant",
        json={"shop_name": "New Kirana", "business_type": "Grocery", "owner_name": "Suresh"},
    )
    assert r.status_code == 201
    assert r.json()["shop_name"] == "New Kirana"

    # one at a time only
    assert client.post("/api/merchant", json={"shop_name": "Third"}).status_code == 409

    # empty shop can load the demo catalogue
    r = client.post("/api/merchant/demo-products")
    assert r.status_code == 201
    assert len(r.json()["created"]) == 9
    assert client.post("/api/merchant/demo-products").status_code == 409

    # PUT with no profile at all -> 404 (defensive, after reset below)


# --- products ----------------------------------------------------------------
def test_list_products_sorted_and_seeded(client):
    products = client.get("/api/products").json()
    assert len(products) == 9
    assert [p["name"] for p in products] == sorted(p["name"] for p in products)
    tea = next(p for p in products if p["name"] == "Tea 500g")
    # opening 40 - 6 (today) - 4 (yesterday) = 30
    assert tea["quantity"] == 30
    assert tea["unit"] == "packet"


def test_create_product_logs_opening_stock(client):
    r = client.post(
        "/api/products",
        json={
            "name": "Test Ladoo",
            "unit": "box",
            "purchase_cost": 60,
            "selling_price": 100,
            "quantity": 10,
            "min_threshold": 3,
            "target_stock": 20,
        },
    )
    assert r.status_code == 201
    pid = r.json()["id"]

    movements = client.get("/api/stock/movements").json()
    assert any(
        m["product_id"] == pid and m["quantity_change"] == 10 and m["reason"] == "Opening stock"
        for m in movements
    )


def test_create_product_validation(client):
    r = client.post("/api/products", json={"name": "", "purchase_cost": -1})
    assert r.status_code == 422


def test_update_product_price_and_quantity(client):
    pid = _id_by_name(client, "Tea 500g")
    r = client.put(f"/api/products/{pid}", json={"selling_price": 160.0})
    assert r.status_code == 200
    assert r.json()["selling_price"] == 160.0

    # quantity correction goes through the movement-aware helper
    r = client.put(f"/api/products/{pid}", json={"quantity": 50})
    assert r.json()["quantity"] == 50
    movements = client.get("/api/stock/movements").json()
    assert any(
        m["product_id"] == pid
        and m["quantity_change"] == 20
        and m["reason"] == "Manual correction"
        for m in movements
    )


def test_delete_product_removes_its_sales_and_movements(client):
    pid = _id_by_name(client, "Tea 500g")
    assert client.delete(f"/api/products/{pid}").status_code == 204

    sales = client.get("/api/sales").json()
    assert all(s["product_id"] != pid for s in sales)
    movements = client.get("/api/stock/movements").json()
    assert all(m["product_id"] != pid for m in movements)
    assert client.delete(f"/api/products/{pid}").status_code == 404


# --- sales -------------------------------------------------------------------
def test_list_sales_and_day_filter(client):
    sales = client.get("/api/sales").json()
    assert len(sales) == 11  # 4 today + 4 yesterday + 3 two days ago
    assert all("product_name" in s for s in sales)

    today_sales = client.get(f"/api/sales?day={TODAY.isoformat()}").json()
    assert len(today_sales) == 4

    empty_day = client.get("/api/sales?day=2020-01-01").json()
    assert empty_day == []


def test_record_sale_decrements_stock_and_logs_movement(client):
    before = next(p for p in client.get("/api/products").json() if p["name"] == "Sugar 1kg")
    r = client.post(
        "/api/sales",
        json={"product_id": before["id"], "quantity": 3, "note": "contract test"},
    )
    assert r.status_code == 201
    assert r.json()["unit_price"] == before["selling_price"]  # price falls back to product

    after = next(p for p in client.get("/api/products").json() if p["name"] == "Sugar 1kg")
    assert after["quantity"] == before["quantity"] - 3

    movements = client.get("/api/stock/movements").json()
    assert any(
        m["product_id"] == before["id"] and m["quantity_change"] == -3 and m["reason"] == "Sale"
        for m in movements
    )


def test_sale_validation(client):
    # unknown product
    r = client.post("/api/sales", json={"product_id": 999999, "quantity": 1})
    assert r.status_code == 404
    # zero quantity
    r = client.post(
        "/api/sales", json={"product_id": _id_by_name(client, "Tea 500g"), "quantity": 0}
    )
    assert r.status_code == 422


# --- profit ------------------------------------------------------------------
def test_profit_table_flags_weak_and_negative_margins(client):
    body = client.get("/api/profit/products").json()
    assert len(body["rows"]) == 9
    assert "estimate" in body["note"].lower()

    flagged = {row["name"]: row["margin_status"] for row in body["flagged"]}
    assert flagged["Brand A biscuits"] == "weak"        # 0% margin (cost == price)
    assert flagged["Instant coffee 100g"] == "negative"  # cost 190 > price 185
    assert "Tea 500g" not in flagged                     # 17% is healthy


def test_profit_summary_matches_seed(client):
    summary = client.get("/api/profit/summary").json()
    assert summary["sales_count"] == 4
    assert summary["revenue"] == 1494.0
    assert summary["estimated_gross_profit"] == 190.0
    assert summary["profit_is_estimate"] is True
    assert "estimate" in summary["note"].lower()


def test_profit_summary_day_filter(client):
    yesterday = (TODAY - timedelta(days=1)).isoformat()
    summary = client.get(f"/api/profit/summary?day={yesterday}").json()
    assert summary["sales_count"] == 4
    assert summary["revenue"] == 1290.0  # 450 + 200 + 60 + 580


# --- stock -------------------------------------------------------------------
def test_stock_alerts_order_and_levels(client):
    body = client.get("/api/stock/alerts").json()
    assert body["count"] == 2
    names = [a["name"] for a in body["alerts"]]
    assert names == ["Milk 500ml", "Cooking oil 1L"]  # critical first, then low

    milk = body["alerts"][0]
    assert milk["level"] == "critical"       # 2 <= 10 * 0.5
    assert milk["suggested_reorder"] == 38   # target 40 - 2
    oil = body["alerts"][1]
    assert oil["level"] == "low"             # 6 <= 6 but > 3
    assert oil["suggested_reorder"] == 24    # target 30 - 6
    assert "forecast" in body["note"].lower()


def test_stock_adjust_updates_and_records_reason(client):
    pid = _id_by_name(client, "Milk 500ml")
    r = client.post(
        "/api/stock/adjust",
        json={"product_id": pid, "quantity_change": -1, "reason": "Shelf count"},
    )
    assert r.status_code == 200
    assert r.json()["quantity"] == 1  # 2 - 1
    assert "updated to 1" in r.json()["message"]

    movements = client.get("/api/stock/movements").json()
    assert movements[0]["product_name"] == "Milk 500ml"
    assert movements[0]["reason"] == "Shelf count"


def test_stock_adjust_validation(client):
    pid = _id_by_name(client, "Tea 500g")
    r = client.post(
        "/api/stock/adjust", json={"product_id": pid, "quantity_change": 0, "reason": "x"}
    )
    assert r.status_code == 422
    r = client.post(
        "/api/stock/adjust", json={"product_id": 999999, "quantity_change": 1, "reason": "x"}
    )
    assert r.status_code == 404


def test_movements_limit(client):
    movements = client.get("/api/stock/movements?limit=5").json()
    assert len(movements) == 5
    assert client.get("/api/stock/movements?limit=0").status_code == 422


# --- customers ---------------------------------------------------------------
def test_customer_crud_and_cascade(client):
    assert len(client.get("/api/customers").json()) == 3

    r = client.post(
        "/api/customers",
        json={"name": "Test Customer", "contact": "9000000000", "purchase_note": "test"},
    )
    assert r.status_code == 201
    cid = r.json()["id"]

    r = client.put(f"/api/customers/{cid}", json={"name": "Renamed"})
    assert r.json()["name"] == "Renamed"

    # deleting the customer must cascade its follow-ups
    r = client.post(
        "/api/followups", json={"customer_id": cid, "due_date": TODAY.isoformat()}
    )
    assert r.status_code == 201
    fid = r.json()["id"]

    assert client.delete(f"/api/customers/{cid}").status_code == 204
    assert client.delete(f"/api/customers/{cid}").status_code == 404
    assert client.put(
        f"/api/followups/{fid}", json={"message": "ghost"}
    ).status_code == 404


# --- follow-ups --------------------------------------------------------------
def test_followup_queues(client):
    due = client.get("/api/followups?status=due").json()
    assert len(due) == 3
    assert all(f["status"] == "due" for f in due)
    # Gupta ji was due 2 days ago -> flagged overdue
    gupta = next(f for f in due if f["customer_name"] == "Gupta ji")
    assert gupta["overdue"] is True
    # ordering is by due date, most urgent first
    assert due[0]["due_date"] <= due[-1]["due_date"]

    done = client.get("/api/followups?status=done").json()
    assert len(done) == 1
    assert done[0]["outcome_note"]

    assert len(client.get("/api/followups?status=all").json()) == 4
    assert client.get("/api/followups?status=maybe").status_code == 422


def test_create_and_edit_followup(client):
    cid = client.get("/api/customers").json()[0]["id"]
    r = client.post(
        "/api/followups",
        json={"customer_id": cid, "due_date": TODAY.isoformat(), "message": "Custom msg"},
    )
    assert r.status_code == 201
    fid = r.json()["id"]
    assert r.json()["message"] == "Custom msg"
    assert r.json()["customer_name"]

    # message defaults when omitted
    r = client.post(
        "/api/followups", json={"customer_id": cid, "due_date": TODAY.isoformat()}
    )
    assert "reminder" in r.json()["message"].lower()

    r = client.put(f"/api/followups/{fid}", json={"message": "Edited"})
    assert r.json()["message"] == "Edited"

    r = client.post(
        "/api/followups", json={"customer_id": 999999, "due_date": TODAY.isoformat()}
    )
    assert r.status_code == 404


def test_complete_followup_is_idempotent_guarded(client):
    due = client.get("/api/followups?status=due").json()
    fid = due[0]["id"]

    r = client.post(
        f"/api/followups/{fid}/complete", json={"outcome_note": "Confirmed order"}
    )
    assert r.status_code == 200
    assert r.json()["status"] == "done"
    assert r.json()["outcome_note"] == "Confirmed order"
    assert r.json()["completed_at"] is not None

    # completing twice is rejected
    r = client.post(f"/api/followups/{fid}/complete", json={"outcome_note": "again"})
    assert r.status_code == 409

    # and it left the due queue
    assert all(f["id"] != fid for f in client.get("/api/followups?status=due").json())


def test_complete_followup_validation(client):
    r = client.post("/api/followups/999999/complete", json={"outcome_note": "x"})
    assert r.status_code == 404
    r = client.put("/api/followups/999999", json={"message": "x"})
    assert r.status_code == 404


# --- advisor -----------------------------------------------------------------
def test_daily_brief_is_rules_by_default_with_basis(client):
    brief = client.get("/api/advisor/daily-brief").json()
    assert brief["generated_by"] == "rules"  # LLM env cleared in conftest
    assert brief["headline"] == "What to review today"
    assert brief["date"] == TODAY.isoformat()
    assert len(brief["signals"]) >= 3
    for signal in brief["signals"]:
        assert signal["module"] in (
            "StockSense",
            "ProfitGuard",
            "Customer Comeback",
            "Unified Advisor",
        )
        assert signal["basis"]  # every claim shows its basis
        assert signal["action"]
    titles = [s["title"] for s in brief["signals"]]
    assert any("Low stock: Milk 500ml" in t for t in titles)
    assert any("Review margin" in t for t in titles)
    assert any("follow-up" in t for t in titles)
    assert "estimates from entered data" in brief["disclaimer"]


def test_daily_brief_falls_back_to_rules_when_llm_unreachable(client, monkeypatch):
    # unroutable local endpoint -> connection refused fast, no exception leaks
    monkeypatch.setenv("ADVISOR_LLM_URL", "http://127.0.0.1:9/v1/chat/completions")
    monkeypatch.setenv("ADVISOR_LLM_KEY", "test-key")
    brief = client.get("/api/advisor/daily-brief").json()
    assert brief["generated_by"] == "rules"
    assert brief["summary"]


# --- dashboard ---------------------------------------------------------------
def test_dashboard_is_one_shot_snapshot(client):
    body = client.get("/api/dashboard").json()
    assert body["merchant"]["shop_name"] == "Sri Balaji Kirana"
    assert body["summary"]["sales_count"] == 4
    assert body["low_stock"]["count"] == 2
    assert len(body["low_stock"]["top"]) == 2
    assert body["advisor"]["headline"] == "What to review today"
    assert body["due_followup_count"] == 3
    # the brief is included so the dashboard needs no second round trip
    assert body["advisor"]["signals"]


# --- voice transcription -----------------------------------------------------
def test_transcribe_requires_a_file(client):
    r = client.post("/api/voice/transcribe", json={})
    assert r.status_code == 422


def test_transcribe_rejects_non_audio(client):
    r = client.post(
        "/api/voice/transcribe",
        files={"file": ("note.txt", b"hello", "text/plain")},
    )
    assert r.status_code == 422
    assert "audio" in r.json()["detail"].lower()


def test_transcribe_rejects_empty_and_oversized_audio(client):
    r = client.post(
        "/api/voice/transcribe",
        files={"file": ("rec.wav", b"", "audio/wav")},
    )
    assert r.status_code == 422

    r = client.post(
        "/api/voice/transcribe",
        files={"file": ("big.wav", b"x" * (5 * 1024 * 1024 + 1), "audio/wav")},
    )
    assert r.status_code == 413


def test_transcribe_reports_missing_key_without_network(client):
    # conftest clears every key env var → the service must fail fast with a
    # clear, merchant-friendly message instead of calling out.
    r = client.post(
        "/api/voice/transcribe",
        files={"file": ("rec.wav", b"RIFFxxxxWAVE", "audio/wav")},
    )
    assert r.status_code == 502
    detail = r.json()["detail"].lower()
    assert "not configured" in detail
    assert "type the command" in detail


def test_transcribe_returns_text_from_service(client, monkeypatch):
    from app.services import transcribe as transcribe_service

    seen = {}

    def fake_transcribe(audio, mime_type):
        seen["audio"] = audio
        seen["mime"] = mime_type
        return "Add 6 packets of tea."

    monkeypatch.setattr(transcribe_service, "transcribe_audio", fake_transcribe)
    r = client.post(
        "/api/voice/transcribe",
        files={"file": ("recording.wav", b"RIFF-fake-audio-bytes", "audio/wav")},
    )
    assert r.status_code == 200
    assert r.json() == {"text": "Add 6 packets of tea."}
    assert seen["audio"] == b"RIFF-fake-audio-bytes"
    assert seen["mime"] == "audio/wav"


def test_transcribe_maps_service_failure_to_502(client, monkeypatch):
    from app.services import transcribe as transcribe_service

    def boom(audio, mime_type):
        raise transcribe_service.TranscribeError(
            "Could not transcribe the recording (quota). Type the command instead."
        )

    monkeypatch.setattr(transcribe_service, "transcribe_audio", boom)
    r = client.post(
        "/api/voice/transcribe",
        files={"file": ("rec.wav", b"RIFF", "audio/wav")},
    )
    assert r.status_code == 502
    assert "type the command" in r.json()["detail"].lower()


# --- data --------------------------------------------------------------------
def test_export_contains_every_collection(client):
    body = client.get("/api/data/export").json()
    assert len(body["merchants"]) == 1
    assert len(body["products"]) == 9
    assert len(body["sales"]) == 11
    assert len(body["stock_movements"]) == 20  # 9 opening + 11 sales
    assert len(body["customers"]) == 3
    assert len(body["follow_ups"]) == 4
    assert "demo" in body["note"].lower()


def test_reset_restores_the_demo_seed(client):
    # dirty the data first
    pid = _id_by_name(client, "Tea 500g")
    client.post("/api/sales", json={"product_id": pid, "quantity": 2})
    assert client.get("/api/profit/summary").json()["sales_count"] == 5

    r = client.post("/api/data/reset")
    assert r.status_code == 200

    summary = client.get("/api/profit/summary").json()
    assert summary["sales_count"] == 4
    assert summary["revenue"] == 1494.0
    assert len(client.get("/api/products").json()) == 9
    assert client.get("/api/stock/alerts").json()["count"] == 2
    assert len(client.get("/api/followups?status=due").json()) == 3
