"""Machine-verified rehearsal of the README's 7-step live demo order.

Each step: act, assert what the judge should see, screenshot.
Ends by resetting to the clean seed. Exits 1 on any failure.

Usage (demo seed must be clean):
    python tests/e2e/rehearsal.py
Env:
    VM_BASE, VM_API, VM_OUT — same as the other e2e scripts
"""

import json
import os
import sys
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = os.getenv("VM_BASE", "http://localhost:5180")
API = os.getenv("VM_API", "http://127.0.0.1:8000/api")
OUT = Path(os.getenv("VM_OUT", Path(__file__).parent / "_screens"))
OUT.mkdir(parents=True, exist_ok=True)

failures = []
steps_done = []


def check(label, condition):
    if condition:
        steps_done.append(label)
        print(f"  PASS  {label}")
    else:
        failures.append(label)
        print(f"  FAIL  {label}")


def api_get(path):
    with urllib.request.urlopen(API + path, timeout=10) as r:
        return json.loads(r.read().decode())


def shot(page, name):
    page.screenshot(path=str(OUT / f"rehearsal-{name}.png"), full_page=True)


def main():
    seed = api_get("/profit/summary")
    print(f"start state: sales={seed['sales_count']} revenue={seed['revenue']}")
    if seed["sales_count"] != 4 or seed["revenue"] != 1494.0:
        print("  ! seed not clean — run POST /api/data/reset first")
        return 1

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1360, "height": 900})
        console_errors = []
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: console_errors.append(f"PAGEERROR: {e}"))

        # ---- Step 1: dashboard, introduce the shop --------------------
        print("\nSTEP 1 — dashboard intro")
        page.goto(BASE + "/dashboard", wait_until="networkidle")
        page.wait_for_timeout(500)
        body = page.inner_text("body")
        check("shop name shown", "Sri Balaji Kirana" in body)
        check("revenue ₹1,494", "₹1,494" in body)
        check("advisor headline", "What to review today" in body)
        check("low stock visible (Milk 500ml)", "Milk 500ml" in body)
        check("7-day chart rendered", page.locator("svg.recharts-surface").count() > 0)
        check("est. gross profit labelled as estimate", "Estimate from entered cost" in body)
        shot(page, "01-dashboard")

        # ---- Step 2: add a product with cost & price ------------------
        print("\nSTEP 2 — add product (ProfitGuard)")
        page.goto(BASE + "/profit", wait_until="networkidle")
        page.wait_for_timeout(400)
        page.get_by_role("button", name="+ Add product", exact=True).click()
        page.wait_for_timeout(300)
        modal = page.locator(".modal-backdrop")
        modal.get_by_label("Product name").fill("Demo Ladoo 250g")
        modal.get_by_label("Unit").fill("box")
        modal.get_by_label("Current quantity").fill("10")
        modal.get_by_label("Purchase cost").fill("60")
        modal.get_by_label("Selling price").fill("100")
        modal.get_by_label("Alert level").fill("3")
        modal.get_by_label("Target stock").fill("20")
        modal.get_by_role("button", name="Add product", exact=True).click()
        page.wait_for_timeout(900)
        body = page.inner_text("body")
        check("product added notice", "added to your catalogue" in body)
        check("appears in profitability table", "Demo Ladoo 250g" in body)
        check("40% estimated margin computed", "40%" in body)
        shot(page, "02-product-added")

        # ---- Step 3: record a sale, profit updates --------------------
        print("\nSTEP 3 — record sale")
        before = api_get("/profit/summary")
        page.select_option("select[required]", label="Demo Ladoo 250g (stock: 10 box)")
        page.fill('input[type="number"][min="1"]', "2")
        page.get_by_role("button", name="Record sale", exact=True).click()
        page.wait_for_timeout(1000)
        body = page.inner_text("body")
        check("sale recorded notice", "Sale recorded" in body)
        after = api_get("/profit/summary")
        check(f"revenue {before['revenue']} -> {after['revenue']} (+200)",
              after["revenue"] == before["revenue"] + 200)
        check("page shows ₹1,694", "₹1,694" in body)
        tea = next(x["quantity"] for x in api_get("/products") if x["name"] == "Tea 500g")
        check("stock untouched by sale of another product (tea=30)", tea == 30)
        shot(page, "03-sale-recorded")

        # ---- Step 4: stock down -> StockSense alert -------------------
        print("\nSTEP 4 — stock down, alert appears")
        page.goto(BASE + "/stock", wait_until="networkidle")
        page.wait_for_timeout(400)
        page.get_by_label("Direction").select_option(value="out")
        page.select_option("select[required]", label="Demo Ladoo 250g (stock: 8 box)")
        page.get_by_label("Quantity").fill("7")
        page.get_by_label("Reason").select_option(label="Manual count")
        page.get_by_role("button", name="Update stock", exact=True).click()
        page.wait_for_timeout(900)
        body = page.inner_text("body")
        check("stock updated to 1", "updated to 1 box(s)" in body)
        check("critical alert raised", "Demo Ladoo 250g is 1 box(s)" in body)
        check("suggested reorder shown", "19" in body)
        shot(page, "04-stock-alert")

        # ---- Step 5: due follow-up -> edit -> complete -----------------
        print("\nSTEP 5 — follow-up: edit message, mark complete")
        page.goto(BASE + "/customers", wait_until="networkidle")
        page.wait_for_timeout(500)
        card = page.locator("article").first
        check("due queue has cards", page.locator("article").count() > 0)
        card.get_by_role("button", name="Edit", exact=True).click()
        page.wait_for_timeout(300)
        card.locator("textarea").fill(
            "Rehearsal: monthly ration reminder — would you like the usual sugar set?")
        card.get_by_role("button", name="Save template", exact=True).click()
        page.wait_for_timeout(700)
        check("message template saved", "Message template updated" in page.inner_text("body"))
        card.get_by_role("button", name="Mark complete", exact=True).click()
        page.wait_for_timeout(300)
        modal = page.locator(".modal-backdrop")
        modal.get_by_label("Outcome note").fill("Rehearsal: confirmed usual order")
        modal.get_by_role("button", name="Mark complete", exact=True).click()
        page.wait_for_timeout(900)
        check("follow-up completed", "Follow-up marked complete" in page.inner_text("body"))
        shot(page, "05a-followup-completed")
        page.get_by_role("button", name="Completed").click()
        page.wait_for_timeout(500)
        body = page.inner_text("body")
        check("outcome visible in Completed tab", "Rehearsal: confirmed usual order" in body)
        shot(page, "05b-completed-tab")

        # ---- Step 6: voice command -> transcript -> confirm ------------
        print("\nSTEP 6 — VoiceDukaan command with confirmation")
        tea_before = next(x["quantity"] for x in api_get("/products") if x["name"] == "Tea 500g")
        page.goto(BASE + "/voice", wait_until="networkidle")
        page.wait_for_timeout(400)
        page.fill('input[placeholder*="Add 4 packets"]', "Add 6 packets of tea")
        page.get_by_role("button", name="Interpret", exact=True).click()
        page.wait_for_timeout(500)
        body = page.inner_text("body")
        check("interpreted as add_stock", "add stock" in body.lower())
        check("confirmation card shown", "Confirm & save" in body)
        shot(page, "06a-voice-confirm")
        page.get_by_role("button", name="Confirm & save", exact=True).click()
        page.wait_for_timeout(1000)
        body = page.inner_text("body")
        check("stock updated via voice", "Stock updated" in body)
        tea_after = next(x["quantity"] for x in api_get("/products") if x["name"] == "Tea 500g")
        check(f"tea {tea_before} -> {tea_after} (+6)", tea_after == tea_before + 6)
        shot(page, "06b-voice-saved")

        # ---- Step 7: finish on the advisor brief ----------------------
        print("\nSTEP 7 — finish on the Unified Advisor brief")
        page.goto(BASE + "/dashboard", wait_until="domcontentloaded")
        try:
            page.wait_for_selector("text=What to review today", timeout=45000)
        except Exception:
            # transient slow LLM call — reload once
            print("  note: brief slow, retrying once")
            page.reload(wait_until="domcontentloaded")
            page.wait_for_selector("text=What to review today", timeout=45000)
        page.wait_for_timeout(800)
        body = page.inner_text("body")
        check("advisor brief shown", "What to review today" in body)
        check("new critical signal picked up", "Demo Ladoo 250g" in body)
        mode = "AI explanation" if "AI explanation" in body else (
            "transparent rules" if "transparent rules" in body else "unknown")
        print(f"  info  brief generated by: {mode}")
        check("generation mode badge visible", mode != "unknown")
        shot(page, "07-advisor-final")

        print("\nconsole errors:", console_errors or "none")
        if console_errors:
            failures.append("console errors")
        browser.close()

    # ---- restore clean seed ------------------------------------------
    req = urllib.request.Request(API + "/data/reset", data=b"{}",
                                 headers={"Content-Type": "application/json"}, method="POST")
    urllib.request.urlopen(req, timeout=15).read()
    seed = api_get("/profit/summary")
    products = api_get("/products")
    check("reset: seed restored (4 sales / ₹1,494 / 9 products)",
          seed["sales_count"] == 4 and seed["revenue"] == 1494.0 and len(products) == 9)

    print(f"\n=== {len(steps_done)} passed, {len(failures)} failed ===")
    for f in failures:
        print("  FAILED:", f)
    return 1 if failures else 0


sys.exit(main())
