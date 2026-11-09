"""Unified AI Business Advisor.

The Advisor is a coordination layer, not a fifth business system. It reads
confirmed shop records and module outputs and produces a short daily brief.

Rules-only mode always works (no network, no key). If an OpenAI-compatible
endpoint is configured through environment variables, an LLM may polish the
wording — arithmetic and thresholds stay deterministic and traceable.
"""

import json
import os
import urllib.error
import urllib.request
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Customer, FollowUp
from app.services import profit as profit_service
from app.services import stock as stock_service

LLM_URL = os.getenv("ADVISOR_LLM_URL", "").strip()
LLM_KEY = os.getenv("ADVISOR_LLM_KEY", "").strip()
LLM_MODEL = os.getenv("ADVISOR_LLM_MODEL", "gpt-4o-mini").strip()


def _due_followups(db: Session, merchant_id: int) -> list[dict]:
    today = date.today()
    pairs = db.execute(
        select(FollowUp, Customer)
        .join(Customer, FollowUp.customer_id == Customer.id)
        .where(Customer.merchant_id == merchant_id, FollowUp.status == "due")
        .order_by(FollowUp.due_date)
    ).all()

    due, overdue = [], []
    for follow_up, customer in pairs:
        item = {
            "follow_up_id": follow_up.id,
            "customer": customer.name,
            "due_date": follow_up.due_date.isoformat(),
            "message": follow_up.message,
        }
        (overdue if follow_up.due_date < today else due).append(item)
    return due + overdue


def build_signals(db: Session, merchant_id: int) -> list[dict]:
    """Deterministic signals from module outputs. Each keeps its source visible."""
    signals: list[dict] = []

    for alert in stock_service.stock_alerts(db, merchant_id)[:3]:
        signals.append(
            {
                "module": "StockSense",
                "severity": "critical" if alert["level"] in ("out_of_stock", "critical") else "warning",
                "title": f"Low stock: {alert['name']}",
                "detail": alert["explanation"],
                "action": "Check shelf quantity before ordering.",
                "basis": (
                    f"quantity {alert['quantity']} vs alert level {alert['min_threshold']}"
                    + (
                        f"; suggested reorder {alert['suggested_reorder']}"
                        if alert["suggested_reorder"] is not None
                        else ""
                    )
                ),
            }
        )

    flagged = profit_service.low_margin_rows(profit_service.product_profit_rows(db, merchant_id))
    for row in flagged[:3]:
        pct = row["gross_margin_pct"]
        pct_text = "no margin data" if pct is None else f"{pct}% estimated margin"
        signals.append(
            {
                "module": "ProfitGuard",
                "severity": "critical" if row["margin_status"] == "negative" else "warning",
                "title": f"Review margin: {row['name']}",
                "detail": f"{row['name']} has {pct_text} on entered cost and price.",
                "action": "Review cost, selling price or discount.",
                "basis": (
                    f"cost {row['purchase_cost']} × price {row['selling_price']} — "
                    "estimate from entered values"
                ),
            }
        )

    follow_ups = _due_followups(db, merchant_id)
    if follow_ups:
        names = ", ".join(f["customer"] for f in follow_ups[:3])
        signals.append(
            {
                "module": "Customer Comeback",
                "severity": "warning" if follow_ups[0]["due_date"] < date.today().isoformat() else "info",
                "title": f"{len(follow_ups)} customer follow-up(s) due",
                "detail": f"Due today or overdue: {names}.",
                "action": "Review and send an appropriate message manually.",
                "basis": "follow-up dates set by you",
            }
        )

    summary = profit_service.daily_summary(db, merchant_id)
    if summary["sales_count"]:
        signals.append(
            {
                "module": "ProfitGuard",
                "severity": "info",
                "title": f"Today: {summary['sales_count']} sale(s) recorded",
                "detail": (
                    f"Revenue {summary['revenue']} with an estimated gross profit of "
                    f"{summary['estimated_gross_profit']}."
                ),
                "action": "Confirm entered costs keep this estimate accurate.",
                "basis": "sales recorded today × entered purchase cost",
            }
        )

    if not signals:
        signals.append(
            {
                "module": "Unified Advisor",
                "severity": "info",
                "title": "Nothing urgent today",
                "detail": "No low stock, weak margins or due follow-ups were found in your records.",
                "action": "Enjoy the quiet — or add today's sales to keep estimates fresh.",
                "basis": "checked stock thresholds, margins and follow-up dates",
            }
        )
    return signals


def _rules_brief(signals: list[dict]) -> str:
    parts = []
    for s in signals[:4]:
        parts.append(f"{s['title']} — {s['action']}")
    return " ".join(parts)


def _llm_brief(signals: list[dict], shop_name: str) -> str | None:
    """Optional polish. Returns None on any problem so rules-only takes over."""
    if not LLM_URL or not LLM_KEY:
        return None
    payload = {
        "model": LLM_MODEL,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are a plain-language business advisor for small Indian shop owners. "
                    "Rewrite the given signals into 2 short sentences for a daily brief. "
                    "Never invent numbers, never promise profit, and keep every figure exactly "
                    "as provided."
                ),
            },
            {
                "role": "user",
                "content": f"Shop: {shop_name}\nSignals:\n{json.dumps(signals, ensure_ascii=False)}",
            },
        ],
        "max_tokens": 220,
        "temperature": 0.2,
    }
    request = urllib.request.Request(
        LLM_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {LLM_KEY}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            body = json.loads(response.read().decode("utf-8"))
        return body["choices"][0]["message"]["content"].strip()
    except (urllib.error.URLError, KeyError, IndexError, ValueError, TimeoutError):
        return None


def daily_brief(db: Session, merchant_id: int, shop_name: str) -> dict:
    signals = build_signals(db, merchant_id)
    generated_by = "rules"
    summary = _rules_brief(signals)

    llm_text = _llm_brief(signals, shop_name)
    if llm_text:
        summary = llm_text
        generated_by = "llm"

    return {
        "date": date.today().isoformat(),
        "generated_by": generated_by,
        "headline": "What to review today",
        "summary": summary,
        "signals": signals,
        "disclaimer": (
            "Informational only — estimates from entered data. "
            "You review and decide; nothing is saved automatically."
        ),
    }
