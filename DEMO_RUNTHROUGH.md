# Demo runthrough — VyapaarMitra AI

A step-by-step guide for the live demo (README's 7-step order), with talking
points, what the judge should see, and the reference screenshot captured by the
automated rehearsal for each step.

**Before you start**

```powershell
# backend (with optional LLM polish)
$env:ADVISOR_LLM_URL='https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
$env:ADVISOR_LLM_KEY=$env:GEMINI_API_KEY
$env:ADVISOR_LLM_MODEL='gemini-3-flash-preview'
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000     # workdir: backend

npm run dev                                                      # workdir: frontend → http://localhost:5180
```

Then open **Settings → Reset demo data** once so every judge sees the clean
seed: 4 sales · ₹1,494 · 9 products · 2 low-stock alerts · 4 follow-ups.

Every screen carries the **Estimates only** badge — say it out loud early:
*"Every number here is an estimate from data you entered; we don't file taxes
or auto-message anyone."*

---

## Step 1 — Dashboard: introduce the shop
**Screenshot:** `docs/demo/rehearsal-01-dashboard.png`

- *"This is Sri Balaji Kirana, a demo kirana shop — sample data for judging."*
- Point at the four KPI cards: today's revenue ₹1,494, est. gross profit ₹190
  (labelled *Estimate from entered cost & price*), 2 low-stock alerts, 3 follow-ups.
- **Unified AI Business Advisor** sits at the top: *"One brief instead of four
  screens — it reads all modules and tells me what to review today."*
- Badge shows how the brief was made: **AI explanation** (LLM) or
  **transparent rules** (deterministic fallback). Either is a good answer:
  *"If the LLM is unavailable it falls back to plain rules — the demo never
  breaks."*
- Mention the 7-day chart: bars = revenue, line = estimated gross profit.

## Step 2 — ProfitGuard: add a product with cost & price
**Screenshot:** `docs/demo/rehearsal-02-product-added.png`

- Go to **ProfitGuard** → **+ Add product** → add *Demo Ladoo 250g*
  (10 box · cost ₹60 · price ₹100 · alert 3 · target 20).
- *"Margin is computed from what I typed — 40% here — and it's always labelled
  an estimate."*
- Show the margin column in the profitability table and the margin bar chart.

## Step 3 — Record a sale → profit updates
**Screenshot:** `docs/demo/rehearsal-03-sale-recorded.png`

- Record a sale: *Demo Ladoo 250g × 2* → **Record sale**.
- Dashboard/ProfitGuard revenue goes ₹1,494 → ₹1,694 (+₹200), stock 10 → 8.
- *"One action, three effects: revenue, estimated profit, and stock all update
  from the same record."*

## Step 4 — StockSense: reduce stock → alert fires
**Screenshot:** `docs/demo/rehearsal-04-stock-alert.png`

- **StockSense** → direction *Stock out (−)* → *Demo Ladoo 250g* → qty 7 →
  reason *Manual count* → **Update stock**.
- Stock drops to 1 → **critical** alert appears with basis
  *"quantity 1 vs alert level 3 · target 20 · suggested reorder 19"*.
- *"Thresholds are yours — no demand forecasting, no automatic supplier
  ordering. Every change keeps its reason in the movement log."*

## Step 5 — Customer Comeback: edit message → mark complete
**Screenshot:** `docs/demo/rehearsal-05a-followup-completed.png`,
`docs/demo/rehearsal-05b-completed-tab.png`

- **Customer Comeback** → pick a due follow-up → **Edit** → change the message
  template → **Save template**.
- **Mark complete** → outcome note → confirm.
- Switch to the **Completed** tab to show the outcome is kept.
- *"We draft the message and you send it yourself — no automatic messaging,
  and the outcome stays on record."*

## Step 6 — VoiceDukaan: one command, transcript, confirmation
**Screenshot:** `docs/demo/rehearsal-06a-voice-confirm.png`,
`docs/demo/rehearsal-06b-voice-saved.png`

- Click **Speak**, say *"Add 6 packets of tea"* — the mic records your voice
  (watch the red recording state, then **Stop**), the clip plays back, and the
  server transcribes it in a few seconds (or type it in the **Typed fallback**
  box — same parser, same confirmation).
- Show the editable transcript → interpretation card
  (`add stock`, product, qty).
- **Nothing is saved until you press Confirm & save.** Press it →
  *"Tea 500g updated to 36 packet(s)."*
- Other demoable intents: *"What is low in stock?"*, *"Show follow-ups due"*,
  *"Price of tea"*, *"What did I sell today"*, *"Show my daily summary"*
  (read-only ones never touch data).
- If the mic is unavailable: *"The typed fallback uses the exact same flow."*

## Step 7 — Finish on the advisor brief
**Screenshot:** `docs/demo/rehearsal-07-advisor-final.png`

- Back to **Dashboard** — the brief now includes the new signal:
  *"Low stock: Demo Ladoo 250g — suggested reorder 19."*
- *"Everything we just did flows into one brief, with the basis for every
  number and a disclaimer: informational only, you review and decide."*
- Close on the footer: *"Decision support, not an accountant."*

**After the demo:** Settings → **Reset demo data** to restore the clean seed.

---

## Automated rehearsal

```bash
python tests/e2e/rehearsal.py
```

Drives all 7 steps in a headless browser, asserts what the judge should see at
each step, screenshots every step, resets the seed, and exits non-zero on any
failure. Last runs: **28/28 assertions passed, 0 console errors** — on both the
dev server (`:5180`) and the production bundle (`npm run preview`, `:5181`).

The mic path is covered by `python tests/e2e/mic_path.py`: a **real
MediaRecorder capture** (Chromium fake-microphone flags) runs the full flow —
record → WAV upload → transcript → interpret → Confirm & save → real stock
update 30 → 36 (only the transcription response is route-intercepted so the
suite never depends on third-party quota). Scenario B posts a genuine spoken
WAV to the real Gemini-backed endpoint as an informational check. **A live
human-mic test still has to happen on a real machine.**

`python tests/e2e/smoke.py` additionally checks all 8 pages, the three
read-only voice intents and a sale recording, with zero console errors.
