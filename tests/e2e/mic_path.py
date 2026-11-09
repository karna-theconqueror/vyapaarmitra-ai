"""VoiceDukaan mic-path verification.

Headless Chrome's real speech service hangs (no events ever fire), so this does:

  A) REAL API + logging wrapper  -> proves our handler calls start() and wires events
  B) MOCK API firing onstart/onresult with a transcript ->
     full app wiring: listening UI -> transcript -> interpretation ->
     Confirm & save -> REAL stock update (verified via the API), then reset.

A live human-mic test still has to happen on a real machine; this covers
everything except the actual audio capture.

Usage: python tests/e2e/mic_path.py   (env: VM_BASE, VM_API, VM_OUT)
"""

import json
import os
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = os.getenv("VM_BASE", "http://localhost:5180")
API = os.getenv("VM_API", "http://127.0.0.1:8000/api")
OUT = Path(os.getenv("VM_OUT", Path(__file__).parent / "_screens"))
OUT.mkdir(parents=True, exist_ok=True)

results = []


def api_get(path):
    with urllib.request.urlopen(API + path, timeout=10) as r:
        return json.loads(r.read().decode())


def tea_qty():
    products = api_get("/products")
    return next(p["quantity"] for p in products if p["name"] == "Tea 500g")


WRAPPER = """
(() => {
  const Real = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Real) return;
  window.__srLog = [];
  const Wrapped = class extends Real {
    start() { window.__srLog.push('start'); try { return super.start(); } catch (e) {
      window.__srLog.push('start-threw:' + e.message); } }
    stop() { window.__srLog.push('stop'); try { return super.stop(); } catch (e) {} }
  };
  window.SpeechRecognition = Wrapped;
  window.webkitSpeechRecognition = Wrapped;
})();
"""

MOCK = """
(() => {
  window.__srLog = [];
  const Mock = class {
    start() {
      window.__srLog.push('start');
      setTimeout(() => {
        if (this.onstart) this.onstart();
        setTimeout(() => {
          const transcript = 'Add 6 packets of tea';
          const results = [{ 0: { transcript }, isFinal: true }];
          results.length = 1;
          if (this.onresult) this.onresult({ results });
          if (this.onend) this.onend();
          window.__srLog.push('result-sent');
        }, 400);
      }, 150);
    }
    stop() { window.__srLog.push('stop'); if (this.onend) this.onend(); }
  };
  window.SpeechRecognition = Mock;
  window.webkitSpeechRecognition = Mock;
})();
"""

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)

    # ---------- A) real API: does our handler call start()? ----------
    page = browser.new_page(viewport={"width": 1360, "height": 900})
    page.add_init_script(WRAPPER)
    page.goto(BASE + "/voice", wait_until="networkidle")
    page.wait_for_timeout(400)
    page.click('button[aria-label="Start listening"]')
    page.wait_for_timeout(4000)
    log = page.evaluate("window.__srLog || []")
    listening_ui = "Listening" in page.inner_text("body")
    results.append(f"A) real API: handler called start() = {'start' in log}, "
                   f"events fired = {len(log) > 1} (headless speech service hangs), "
                   f"listening UI before onstart = {listening_ui}")
    page.close()

    # ---------- B) mock API: full wiring incl. real confirm ----------
    before = tea_qty()
    page = browser.new_page(viewport={"width": 1360, "height": 900})
    page.add_init_script(MOCK)
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"PAGEERROR: {e}"))
    page.goto(BASE + "/voice", wait_until="networkidle")
    page.wait_for_timeout(400)

    page.click('button[aria-label="Start listening"]')
    page.wait_for_timeout(1500)          # onstart -> onresult(final) -> onend
    body = page.inner_text("body")

    has_transcript = "Add 6 packets of tea" in page.input_value("textarea")
    # the UI renders the intent as "Add stock" (not the raw id "add_stock")
    has_interp = ("add stock" in body.lower() or "add_stock" in body.lower()) and "Add 6" in body
    has_confirm = "Confirm & save" in body
    wiring_ok = has_transcript and has_interp and has_confirm
    page.screenshot(path=str(OUT / "mic-mock-interpreted.png"), full_page=True)
    results.append(f"B) mock: transcript captured = {has_transcript}, "
                   f"interpreted = {has_interp}, confirm button = {has_confirm}")

    if has_confirm:
        page.click('button:has-text("Confirm & save")')
        page.wait_for_timeout(1200)
        body = page.inner_text("body")
        saved = "Stock updated" in body
        page.screenshot(path=str(OUT / "mic-mock-saved.png"), full_page=True)
        after = tea_qty()
        results.append(f"B) confirm: UI says saved = {saved}, "
                       f"tea stock {before} -> {after} (expected +6) = {after == before + 6}")
        wiring_ok = wiring_ok and saved and after == before + 6
    else:
        after = tea_qty()
        results.append("B) confirm: BUTTON MISSING — stock unchanged")
        wiring_ok = False

    results.append(f"B) console errors: {errors or 'none'}")
    page.close()
    browser.close()

# restore clean demo data after the test write
req = urllib.request.Request(API + "/data/reset", data=b"{}",
                             headers={"Content-Type": "application/json"}, method="POST")
urllib.request.urlopen(req, timeout=15).read()
results.append(f"reset done; tea stock back to {tea_qty()}")

print("\n--- mic path report ---")
for line in results:
    print(" •", line)

# Fail when the app wiring is broken (scenario A's hanging service is an
# environment limitation, not an app bug, so only B gates the exit code).
raise SystemExit(0 if wiring_ok else 1)
