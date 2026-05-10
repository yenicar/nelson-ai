# Nelson AI — Account Intelligence System

> An always-on AI Account Manager for B2B portfolios.
> He reads the customer data, identifies risk, briefs the human, and drafts actions for approval. He never sends, never bills, never decides — humans do that.

Nelson lives in two surfaces with one brain:

- **Dashboard** — a portfolio-first canvas organized around Gartner's four levels of analytics (descriptive → diagnostic → predictive → prescriptive). Floating glass chat widget for natural-language Q&A.
- **Telegram bot** — same Nelson on your phone. Morning briefings, status checks, action drafts, all by customer name.

## Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI · DuckDB · Pydantic · Python 3.11+ |
| AI | Google Gemini 2.5 Flash (function-calling agent loop) |
| Frontend | Next.js 14 · React 18 · TypeScript · Tailwind |
| Data | 2,000 B2B customers · 15 tables · ~28 MB (synthesized from two Kaggle datasets) |
| Memory | DuckDB tables (`nelson_sessions`, `nelson_messages`) |
| Action queue | DuckDB `pending_actions` table — Nelson drafts, human approves |

## Quickstart

### Prerequisites
- Python 3.11+
- Node 18+
- A Google Gemini API key (free tier works) → https://aistudio.google.com/apikey
- *(optional)* A Telegram bot token from `@BotFather`

### Setup

```bash
# 1. Configure env
cp .env.example .env
# Open .env and paste:
#   GEMINI_API_KEY=...
#   TELEGRAM_BOT_TOKEN=... (optional)

# 2. Install Python deps
pip install -e .[dev]

# 3. Build the database from CSVs (idempotent)
set PYTHONPATH=backend
python -m nelson.cli build-data

# 4. Install + run the frontend (separate terminal)
cd frontend
npm install
npm run dev

# 5. Run the backend (Telegram bot starts automatically if token is set)
cd ..
set PYTHONPATH=backend
python -m nelson.cli serve
```

Then open http://localhost:3000 — login with the dev credentials in `.env` (default `demo@nelson.ai` / `demo`).

### CLI commands

```bash
python -m nelson.cli build-data           # rebuild nelson.duckdb from CSVs
python -m nelson.cli smoke                # quick read-test (3 sample queries)
python -m nelson.cli ask "<question>"     # ask Nelson via the CLI
python -m nelson.cli brief                # generate a portfolio morning brief
python -m nelson.cli serve                # FastAPI + Telegram bot
python -m nelson.cli eval [N] [seed]      # run holdout eval (default N=30)
```

## Where the AI System Design Elements live

Nelson exhibits **five** of the eight elements the IS 303 rubric accepts. Each is named, located, and visible in operation:

| # | AI design element | Where it lives | Visible in operation |
|---|---|---|---|
| 1 | **Multi-step workflow / orchestration** | `backend/nelson/ai/agent.py` — Gemini's automatic function calling loops up to 10 turns. Each turn: model decides → tool runs → result fed back → next decision. | Watch a chat reply: Nelson typically calls 3–6 tools in sequence per question (e.g. `find_customer` → `get_customer_profile` → `get_recent_tickets` → `propose_action`). |
| 2 | **Tool use / tool calling** | `backend/nelson/ai/tools.py` — 13 typed Python tools the agent can invoke (`find_customer`, `get_recent_orders`, `propose_action`, etc.). | Every Nelson response is grounded in tool calls; check the backend terminal logs to see which tools fired. |
| 3 | **Structured outputs / output contracts** | `backend/nelson/eval.py` — predictions use Gemini's `response_mime_type="application/json"` with a strict schema. `backend/nelson/data/schemas.py` — pydantic models on every read boundary. | Eval report includes parse-error count; predictions are validated as JSON before scoring. |
| 4 | **Memory / state across sessions** | `nelson_sessions` and `nelson_messages` DuckDB tables. The agent loads the last 20 messages per session before each turn. | Telegram remembers your previous question; close the chat widget and reopen — Nelson has the conversation context. |
| 5 | **Traceable evidence / audit trail** | `pending_actions` table (Nelson's drafts) + `human_decisions` table (human approvals/rejects). Every action is timestamped, attributed, and linked back to a customer + Nelson rationale + confidence score. | The right rail "Pending actions" panel is this audit trail rendered. Approving an action writes a `human_decisions` row. |

Two more elements are partially supported:

- **Deterministic downstream logic** — risk band classification, revenue-at-risk calculation, lane assignment all run as deterministic Python on top of model output.
- **Simulation / synthetic respondent** — eval harness simulates a reviewer's decision and compares to ground truth.

## Evaluation

Nelson is graded against **2,583 real human decisions** in `customer_review_logs` (the dataset ships with labeled outcomes). To run:

```bash
python -m nelson.cli eval 30
```

Output:
- `eval/reports/eval_<timestamp>.md` — agreement rate, confusion matrix, per-customer detail
- `eval/reports/eval_<timestamp>.json` — machine-readable results

Metrics:
- **Decision agreement** — Nelson's predicted decision (Monitor / Stabilize / Escalate) vs `human_decision`
- **Citation existence** — fraction of Nelson's cited record IDs that resolve to real records in the bundle
- **Confusion matrix** — where Nelson agrees vs where it deviates, by class

This is the rubric Category D ("Results, Evaluation & Human Oversight") evidence.

## Project layout

```
nelson_ai/
├── backend/
│   └── nelson/
│       ├── api/                 # FastAPI routes + middleware (auth, RBAC)
│       ├── domain/              # pure domain logic (reserved)
│       ├── data/                # DuckDB, schemas, repositories, build script
│       ├── ai/                  # the agent — prompts, tools, cache, agent loop, telegram
│       ├── config/settings.py   # env-driven settings
│       ├── eval.py              # holdout evaluation harness
│       └── cli.py               # `nelson <command>`
├── frontend/                    # Next.js dashboard
│   ├── app/                     # layout, login, dashboard
│   └── src/
│       ├── components/          # KPIStrip, DiagnosticCanvas, RightRail, ChatWidget, AccountDrawer, AccountCard
│       └── lib/                 # api client, types, format helpers
├── data/
│   ├── customer_2000/           # the canonical dataset (15 CSVs)
│   ├── data_dictionary/         # schema documentation
│   ├── AUDIT_REPORT.md          # data quality audit
│   └── REPAIR_LOG.md            # documented data repairs
├── scripts/
│   ├── audit_data.py
│   └── repair_data.py
├── eval/reports/                # eval outputs (committed)
├── docs/
│   ├── PROJECT_STATEMENT.md
│   ├── DATA_STATEMENT.md
│   └── SLIDE_DECK.md
└── README.md
```

## Why this design

- **Customer names everywhere user-facing.** No human memorizes `C000037`. The chat, dashboard, and briefings speak in names; IDs live only in logs and the audit trail.
- **Multi-tenant from day one.** Every spine table has a `tenant_id` column. Demo runs as one tenant; another company can plug in their data without a refactor.
- **Human-in-the-loop on every action.** Nelson drafts emails, recommends outreach, proposes risk reclassifications, suggests lifecycle transitions — all land in `pending_actions` for human approval. He never executes.
- **Data is repaired, not pretended-to-be-clean.** `data/AUDIT_REPORT.md` documents every issue found in the merged Kaggle datasets. `data/REPAIR_LOG.md` documents every fix applied. Originals snapshotted in `data/customer_2000/.bak/`.
- **Eval against ground truth, not vibes.** The 2,583 real reviewer decisions in `customer_review_logs` are the validation set. Nelson's recommendations are scored against them.

## License & data attribution

Nelson code is for educational use (IS 303 final project, Spring 2026).

Customer data is synthesized from two public Kaggle datasets:
1. **DataCo Smart Supply Chain Dataset** — orders, fulfillment, customer roster
2. **Customer Support Tickets Dataset** — support volume + sentiment

Merged into the `customer_2000` spine via deterministic mapping rules. Synthesized layers (notes, emails, reviews, outcomes, engagement) are flagged with `synthetic_flag = "true"`. See `data/customer_2000/DATA_SOURCE_AND_LICENSE.md` for full attribution.
