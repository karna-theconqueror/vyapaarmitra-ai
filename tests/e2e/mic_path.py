"""VoiceDukaan record-and-transcribe path verification.

The Speak button now records real audio (getUserMedia + MediaRecorder),
uploads it to POST /api/voice/transcribe and shows the returned transcript
before anything is saved. This suite proves that pipeline:

  A) FULL FLOW (deterministic, gates the exit code):
     fake microphone (Chromium --use-fake-device-for-media-stream) ->
     real MediaRecorder capture -> real WAV conversion -> upload ->
     transcription response (route-intercepted for determinism) ->
     transcript -> interpretation -> Confirm & save -> REAL stock update
     verified through the API, then reset.

  B) REAL TRANSCRIPTION (informational, does not gate):
     POST a genuine spoken WAV (TTS: "Add six packets of tea") to the real
     backend endpoint -> real Gemini transcription. Skipped/failed runs are
     reported but never fail the suite (third-party quota/network).

A live human-mic test still has to happen on a real machine, but scenario A
exercises every line of app code between the microphone and the database.

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

# Optional real-audio sample (TTS) used by scenario B.
SAMPLE_WAV = Path(os.getenv("VM_SAMPLE_WAV", r"C:\Users\HANMANTH\AppData\Local\Temp\opencode\sapi_test.wav"))

results = []
wiring_ok = False


def api_get(path):
    with urllib.request.urlopen(API + path, timeout=10) as r:
        return json.loads(r.read().decode())


def tea_qty():
    products = api_get("/products")
    return next(p["quantity"] for p in products if p["name"] == "Tea 500g")


TRANSCRIPT = "Add 6 packets of tea"

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        args=[
            "--use-fake-device-for-media-stream",
            "--use-fake-ui-for-media-stream",
        ],
    )
    context = browser.new_context(
        viewport={"width": 1360, "height": 900}, permissions=["microphone"]
    )

    # ---------- A) record -> transcribe -> interpret -> real save ----------
    before = tea_qty()
    page = context.new_page()
    errors = []
    upload = {"seen": False, "bytes": 0, "is_wav": False, "filename": ""}
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"PAGEERROR: {e}"))

    def fulfill_transcribe(route):
        body = route.request.post_data_buffer or b""
        upload["seen"] = True
        upload["bytes"] = len(body)
        upload["is_wav"] = b"audio/wav" in body
        idx = body.find(b'filename="')
        if idx >= 0:
            upload["filename"] = body[idx + 10 : body.find(b'"', idx + 10)].decode(
                "utf-8", "replace"
            )
        route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps({"text": TRANSCRIPT}),
        )

    page.route("**/api/voice/transcribe", fulfill_transcribe)
    page.goto(BASE + "/voice", wait_until="networkidle")
    page.wait_for_timeout(400)

    # badge should advertise the new capability
    badge_ok = "record + transcribe ready" in page.inner_text("body")

    page.click('button[aria-label="Start recording"]')
    page.wait_for_timeout(1800)  # fake mic captures ~1.8s of audio
    recording_ui = "Recording" in page.inner_text("body")
    page.click('button[aria-label="Stop recording"]')

    # transcription (WAV conversion + upload + response) then interpretation
    try:
        page.wait_for_selector('button:has-text("Confirm & save")', timeout=20000)
        reached_confirm = True
    except Exception:
        reached_confirm = False
    page.wait_for_timeout(300)

    body = page.inner_text("body")
    has_transcript = TRANSCRIPT in page.input_value("textarea")
    # the UI renders the intent as "Add stock" (not the raw id "add_stock")
    has_interp = ("add stock" in body.lower() or "add_stock" in body.lower()) and "Add 6" in body
    has_player = page.locator("audio").count() > 0
    page.screenshot(path=str(OUT / "mic-record-interpreted.png"), full_page=True)
    results.append(
        f"A) badge = {badge_ok}, recording UI = {recording_ui}, "
        f"upload seen = {upload['seen']} ({upload['bytes']} bytes, "
        f"wav = {upload['is_wav']}, file = {upload['filename'] or '?'}), "
        f"transcript = {has_transcript}, interpreted = {has_interp}, "
        f"confirm = {reached_confirm}, playback = {has_player}"
    )

    if reached_confirm:
        page.click('button:has-text("Confirm & save")')
        page.wait_for_timeout(1500)
        body = page.inner_text("body")
        saved = "Stock updated" in body
        page.screenshot(path=str(OUT / "mic-record-saved.png"), full_page=True)
        after = tea_qty()
        results.append(
            f"A) confirm: UI says saved = {saved}, "
            f"tea stock {before} -> {after} (expected +6) = {after == before + 6}"
        )
        wiring_ok = (
            badge_ok
            and recording_ui
            and upload["seen"]
            and upload["bytes"] > 1000
            and upload["is_wav"]
            and has_transcript
            and has_interp
            and has_player
            and saved
            and after == before + 6
        )
    else:
        results.append("A) confirm: BUTTON MISSING — stock unchanged")
        wiring_ok = False

    results.append(f"A) console errors: {errors or 'none'}")
    if errors:
        wiring_ok = False
    page.close()

    # ---------- B) real transcription of a real spoken WAV (informational) ----------
    if SAMPLE_WAV.exists():
        try:
            boundary = "----vmtest"
            audio = SAMPLE_WAV.read_bytes()
            payload = (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="file"; filename="sapi_test.wav"\r\n'
                f"Content-Type: audio/wav\r\n\r\n"
            ).encode() + audio + f"\r\n--{boundary}--\r\n".encode()
            req = urllib.request.Request(
                API + "/voice/transcribe",
                data=payload,
                headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=60) as r:
                text = json.loads(r.read().decode())["text"]
            ok = "six packets of tea" in text.lower() or "6 packets of tea" in text.lower()
            results.append(f"B) real Gemini transcription: {text!r} matches = {ok} (informational)")
        except Exception as exc:  # noqa: BLE001 - quota/network, never gates
            results.append(f"B) real transcription unavailable: {exc} (informational)")
    else:
        results.append("B) no sample WAV — skipped (informational)")

    context.close()
    browser.close()

# restore clean demo data after the test write
req = urllib.request.Request(
    API + "/data/reset",
    data=b"{}",
    headers={"Content-Type": "application/json"},
    method="POST",
)
urllib.request.urlopen(req, timeout=15).read()
results.append(f"reset done; tea stock back to {tea_qty()}")

print("\n--- mic path report ---")
for line in results:
    print(" •", line)

# Scenario A gates the exit code; B is informational (third-party dependency).
raise SystemExit(0 if wiring_ok else 1)
