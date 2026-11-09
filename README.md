# VyapaarMitra AI — Hackathon Prototype

**Your AI-Powered Business Growth Partner.** A lightweight AI-assisted business companion
for small Indian merchants (kirana stores, grocery shops, stationery shops): simple profit
checks, stock guidance, customer follow-ups and voice-led access — in one understandable
merchant workspace.

> Assistive decision-support only — not an accountant, payment provider, inventory
> automation platform or substitute for merchant judgement. All numbers are **estimates
> from entered data**. All bundled data is **demo/sample data**.

## Quick start

Two terminals (or three, if you like):

```bash
# 1) Backend — FastAPI + SQLite (seeds the demo shop on first boot)
cd backend
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000

# 2) Frontend — React + Vite
cd frontend
npm install
npm run dev
```

Open **http://localhost:5180** — the demo shop *Sri Balaji Kirana* is seeded
automatically with products, sales, stock movements, customers and follow-ups.

| URL | Purpose |
|---|---|
| http://localhost:5180 | Web dashboard (Vite dev server, proxies `/api` → `:8000`) |
| http://localhost:8000/docs | Interactive API documentation (Swagger) |
| http://localhost:8000/api/health | Health check |

> The dev port is pinned to **5180** in `frontend/vite.config.js` because 5173 is
> often already taken by another local project. Change `server.port` if you prefer.

## Project structure

```
vyapaarmitra-ai/
├── backend/
│   └── app/
│       ├── main.py            # FastAPI app, CORS, startup seed
│       ├── database.py        # SQLite engine + session
│       ├── models.py          # Merchant, Product, Sale, StockMovement, Customer, FollowUp
│       ├── schemas.py         # Pydantic request/response models (the API contract)
│       ├── deps.py            # current-merchant / product lookups
│       ├── seed.py            # seeded demo shop (labelled demo data)
│       ├── services/
│       │   ├── profit.py      # ProfitGuard: margin & profit estimates (deterministic)
│       │   ├── stock.py       # StockSense: threshold alerts + reorder suggestion
│       │   └── advisor.py     # Unified Advisor: signals + rules-only / optional LLM
│       └── routers/           # merchant, products, sales, stock, customers, advisor,
│                              # dashboard, data (export/reset)
└── frontend/
    └── src/
        ├── App.jsx            # routes
        ├── api.js             # typed-ish fetch client for every endpoint
        ├── components/        # Shell (layout) + ui kit (cards, badges, modal, …)
        ├── lib/               # formatting helpers + useAsync hook
        └── pages/             # Landing, Onboarding, Dashboard, ProfitGuard,
                               # StockSense, Customers, VoiceDukaan, Settings
```

## Modules → screens

| Module | Screen | Core behaviour |
|---|---|---|
| ProfitGuard | `/profit` | `(selling price − purchase cost) × quantity sold`, margin %, weak/negative list, missing-data flags |
| StockSense | `/stock` | flags quantity **at or below** your alert level, `suggested reorder = target − current`, movement log with reasons |
| Customer Comeback | `/customers` | due/overdue queue, editable message templates, mark complete with outcome note |
| VoiceDukaan | `/voice` | Web Speech API → editable transcript → **confirm before save**, typed fallback |
| Unified AI Business Advisor | `/dashboard` | combines module signals into one short daily brief with visible *basis* lines |

## API contract (frozen for the team)

Base URL: `http://localhost:8000` · JSON only · errors: `{"detail": "<message>"}`

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/merchant` | current shop profile or `null` |
| POST | `/api/merchant` | create profile (`409` if one exists) |
| PUT | `/api/merchant` | update profile |
| POST | `/api/merchant/demo-products` | load demo catalogue into an empty shop |
| GET/POST | `/api/products` | list / create product |
| PUT/DELETE | `/api/products/{id}` | update / delete (removes its sales & movements) |
| GET | `/api/sales?day=YYYY-MM-DD` | list sales (optional date filter) |
| POST | `/api/sales` | record a sale → decrements stock, logs movement |
| GET | `/api/profit/products` | profitability table + flagged margins |
| GET | `/api/profit/summary?day=` | daily revenue / estimated gross profit |
| GET | `/api/stock/alerts` | low-stock alerts, most urgent first |
| POST | `/api/stock/adjust` | `{product_id, quantity_change, reason}` |
| GET | `/api/stock/movements?limit=` | recent movements with product names |
| GET/POST | `/api/customers` | list / create (minimal details) |
| PUT/DELETE | `/api/customers/{id}` | update / delete (cascades follow-ups) |
| GET | `/api/followups?status=due\|done\|all` | follow-up queue (`overdue` flag included) |
| POST | `/api/followups` | schedule follow-up |
| PUT | `/api/followups/{id}` | edit date / message / status |
| POST | `/api/followups/{id}/complete` | complete with outcome note |
| GET | `/api/advisor/daily-brief` | Unified Advisor brief (`generated_by: rules\|llm`) |
| GET | `/api/dashboard` | one-shot snapshot for the main dashboard |
| GET | `/api/data/export` | full JSON export (privacy control) |
| POST | `/api/data/reset` | wipe and reseed the demo shop |
| GET | `/api/health` | liveness |

## Advisor: rules-only by default, LLM optional

Arithmetic and thresholds are always computed locally and traceable
(`services/profit.py`, `services/stock.py`). The LLM only *explains* the signals.
Rules-only mode is the default, so the demo works offline.

```bash
# optional polish — any OpenAI-compatible chat completions endpoint
set ADVISOR_LLM_URL=https://api.openai.com/v1/chat/completions
set ADVISOR_LLM_KEY=sk-...
set ADVISOR_LLM_MODEL=gpt-4o-mini

# Google Gemini (verified working with this repo's GEMINI_API_KEY)
set ADVISOR_LLM_URL=https://generativelanguage.googleapis.com/v1beta/openai/chat/completions
set ADVISOR_LLM_KEY=%GEMINI_API_KEY%
set ADVISOR_LLM_MODEL=gemini-3-flash-preview
```

If the call fails or is slow, the response silently falls back to
`generated_by: "rules"`. The dashboard badge shows which mode produced the brief.

## Voice notes

- Uses the browser Web Speech API (`webkitSpeechRecognition` in Chrome/Edge).
- Supported intents: **add stock** (“Add 6 packets of tea”), **daily summary**,
  **low-stock check**, **follow-up list**, **product lookup** (“Price of tea” —
  read-only price/cost/stock/margin), **today's sales** (“What did I sell today” —
  read-only).
- Read-only intents (lookup, sales, alerts, brief) never write anything; only
  **add stock** changes data, and it **never saves without confirmation**.
- The transcript is editable. Typed fallback uses the same parser.
- Recognition can mishear names and quantities — the confirmation card always shows the
  resolved product and the before/after quantity.

## MVP priorities (from the blueprint)

- **P0** — demo shop setup, shared product data, persistence, dashboard shell,
  ProfitGuard estimate, StockSense alert, follow-up list + completion. ✅
- **P1** — unified advisor brief from module outputs (with visible basis);
  one safe voice intent with confirmation + typed fallback. ✅
- **P2** — polished charts (Recharts: 7-day revenue/profit trend + margin bars),
  export/reset, six voice intents, deployment config. ✅

## Toolchain notes (this machine)

Three environment quirks are handled inside the project so everyone else's build
just works:

1. **`frontend/package.json` → `overrides.rollup = npm:@rollup/wasm-node`**
   Native `.node` DLLs are blocked by the local Application Control policy, which
   breaks `vite build` (rollup's native binding). The WASM build has the same API,
   so `npm run build` works. On hosts without the policy the override is harmless.
2. **`frontend/postcss.config.js`** exists (and is empty) on purpose — without a
   local config, Vite walks up the directory tree and picks up an unrelated
   `postcss.config.js` in the user's home folder, which breaks CSS processing.
3. **Plain CSS instead of Tailwind** (`frontend/src/index.css`): the blueprint
   allows "Tailwind CSS or simple CSS", and a CSS framework would add another
   native binding. The design system lives in one readable stylesheet.

## Deployment

Two pieces: a static frontend and a Python API host.

**Frontend (Vercel or any static host)**

```bash
cd frontend
npm install
npm run build          # → dist/
```

- `frontend/vercel.json` contains the SPA rewrite so deep links
  (`/dashboard`, `/profit`, …) work on refresh.
- The app calls `/api` by default (same origin). For a separate API host, set
  `VITE_API_BASE=https://your-api.example.com` at build time
  (`$env:VITE_API_BASE=...; npm run build`), and add a proxy/rewrite for
  `/api/*` on the host if you prefer same-origin instead.

**Backend (any Python host — Render, Railway, Fly.io, a VPS)**

```bash
cd backend
python -m pip install -r requirements.txt
# SQLite persists on disk; point DATABASE_PATH or mount a volume as needed
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Environment variables for the API host:

| Variable | Purpose |
|---|---|
| `CORS_ORIGINS` | Comma-separated extra origins allowed by CORS (e.g. your Vercel URL) |
| `ADVISOR_LLM_URL` / `ADVISOR_LLM_KEY` / `ADVISOR_LLM_MODEL` | Optional LLM polish for the daily brief |

`ADVISOR_LLM_KEY` never gets committed — set it in the host's secret store.

Then open the deployed URL, run **Settings → Reset demo data** once so judges
see the seeded shop, and rehearse the demo order below.

## Suggested live demo order

1. Open dashboard and introduce the shop.
2. Add/show a product and its cost/price (ProfitGuard).
3. Record a sale → estimated profit updates.
4. Reduce stock (or show the seeded low-stock alerts) → StockSense.
5. Show a due customer follow-up → edit message → mark complete.
6. Use one VoiceDukaan command, check the transcript, confirm.
7. Finish on the Unified AI Business Advisor brief.

## Team split

| Member | Role | Owns |
|---|---|---|
| 1 | AI & Integration Lead | `services/advisor.py`, prompt/LLM wiring, contract upkeep, end-to-end tests, pitch |
| 2 | Frontend Developer | `frontend/src/**`, forms/tables/cards, loading/error/empty states, voice UI |
| 3 | Backend & Database | `models.py`, `routers/**`, `seed.py`, validation, profit/stock/follow-up logic |

Shared agreements: one Git repository · freeze the API contract above early · same seeded
records on every screen · short integration checkpoints · deterministic fallbacks when AI
or voice is unavailable.
