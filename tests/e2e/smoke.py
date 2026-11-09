"""Smoke-test the running VyapaarMitra AI app: pages, key content, console errors.

Usage (both servers up, demo seed clean):
    python tests/e2e/smoke.py
Env:
    VM_BASE  — frontend origin (default http://localhost:5180)
    VM_OUT   — screenshot dir (default tests/e2e/_screens)
"""

import os
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = os.getenv("VM_BASE", "http://localhost:5180")
OUT = Path(os.getenv("VM_OUT", Path(__file__).parent / "_screens"))
OUT.mkdir(parents=True, exist_ok=True)

PAGES = [
    ("/", "Turn everyday shop data"),
    ("/dashboard", "Unified AI Business Advisor"),
    ("/profit", "ProfitGuard"),
    ("/stock", "StockSense"),
    ("/customers", "Customer Comeback"),
    ("/voice", "VoiceDukaan"),
    ("/settings", "Privacy notice"),
]

console_errors = []
failed_requests = []
failures = []


def check(page, url, expected):
    page.goto(BASE + url, wait_until="networkidle")
    page.wait_for_timeout(600)
    body = page.inner_text("body")
    if expected.lower() not in body.lower():
        failures.append(f"{url}: missing text {expected!r}")
    name = "landing" if url == "/" else url.strip("/").replace("/", "-")
    page.screenshot(path=str(OUT / f"{name}.png"), full_page=True)
    print(f"  ok  {url:14} -> {name}.png  ({len(body)} chars)")


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1360, "height": 900})
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append(f"PAGEERROR: {e}"))
    page.on(
        "requestfailed",
        lambda r: failed_requests.append(f"{r.method} {r.url} :: {r.failure}"),
    )

    print(f"visiting pages on {BASE}…")
    for url, expected in PAGES:
        check(page, url, expected)

    # --- dashboard content checks ---
    page.goto(BASE + "/dashboard", wait_until="networkidle")
    page.wait_for_timeout(500)
    dash = page.inner_text("body")
    for needle in ["Milk 500ml", "Cooking oil", "Low stock", "Follow-ups", "estimate"]:
        if needle.lower() not in dash.lower():
            failures.append(f"dashboard: missing {needle!r}")

    # --- voice: run a typed command through the shared parser ---
    page.goto(BASE + "/voice", wait_until="networkidle")
    page.wait_for_timeout(400)
    page.fill('input[placeholder*="Add 4 packets"]', "Add 6 packets of tea")
    page.click('button:has-text("Interpret")')
    page.wait_for_timeout(400)
    voice = page.inner_text("body")
    if "add_stock" not in voice.lower() and "Add 6" not in voice:
        failures.append("voice: typed command was not interpreted")
    if "Confirm" not in voice:
        failures.append("voice: confirmation step missing")
    page.screenshot(path=str(OUT / "voice-interpreted.png"), full_page=True)

    # --- voice intent: product lookup (read-only) ---
    page.fill('input[placeholder*="Add 4 packets"]', "Price of tea")
    page.click('button:has-text("Interpret")')
    page.wait_for_timeout(400)
    body = page.inner_text("body")
    if "product lookup" not in body.lower():
        failures.append("voice: 'Price of tea' not parsed as product_lookup")
    if "Show result" not in body:
        failures.append("voice: read-only button label missing")
    page.click('button:has-text("Show result")')
    page.wait_for_timeout(700)
    body = page.inner_text("body")
    if "Selling price" not in body or "In stock" not in body:
        failures.append("voice: product lookup result incomplete")
    page.screenshot(path=str(OUT / "voice-lookup.png"), full_page=True)

    # --- voice intent: today's sales (read-only) ---
    page.fill('input[placeholder*="Add 4 packets"]', "What did I sell today")
    page.click('button:has-text("Interpret")')
    page.wait_for_timeout(400)
    body = page.inner_text("body")
    if "sales_today" not in body.lower() and "recorded sales" not in body.lower():
        failures.append("voice: 'What did I sell today' not parsed as sales_today")
    page.click('button:has-text("Show result")')
    page.wait_for_timeout(700)
    body = page.inner_text("body")
    if "sale(s) today" not in body and "No sales recorded today" not in body:
        failures.append("voice: today's sales result missing")
    page.screenshot(path=str(OUT / "voice-sales-today.png"), full_page=True)

    # --- profit: record a sale end-to-end ---
    page.goto(BASE + "/profit", wait_until="networkidle")
    page.wait_for_timeout(400)
    page.select_option('select[required]', index=1)
    page.fill('input[type="number"][min="1"]', "2")
    page.click('button:has-text("Record sale")')
    page.wait_for_timeout(900)
    profit = page.inner_text("body")
    if "Sale recorded" not in profit:
        failures.append("profit: sale recording did not confirm")
    page.screenshot(path=str(OUT / "profit-sale-recorded.png"), full_page=True)

    browser.close()

print("\n--- console errors ---")
print("\n".join(console_errors) or "none")
print("\n--- failed requests ---")
print("\n".join(failed_requests) or "none")
print("\n--- failures ---")
print("\n".join(failures) or "none")

sys.exit(1 if (failures or console_errors or failed_requests) else 0)
