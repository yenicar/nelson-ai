# Nelson AI — Account Intelligence System

> **An always-on AI Account Manager for B2B portfolios.**
> Nelson reads your customer data, identifies risk, briefs you, and drafts actions for you to approve. He never sends, never charges, never decides — humans do that.

Built as the IS 303 final project (Spring 2026), structured to extend into a production system.

---

## What Nelson does

- **Reads the portfolio** — orders, support tickets, customer notes, email threads, fulfillment incidents, engagement events. 2,000 customers across 15 tables.
- **Identifies risk** — surfaces accounts grouped by *primary concern* (open critical tickets · late-delivery risk · health declining · watch list).
- **Drafts actions** — emails, escalations, follow-ups, credits, lifecycle changes, risk reclassifications, expedites, internal notes. *All* land in a pending-approval queue.
- **Records every decision** — every approval/rejection writes to `human_decisions` with attribution and timestamp. Full audit trail, visible in the dashboard.

## Two surfaces, one brain

| Surface | What it's for |
|---|---|
| **Dashboard** (Next.js) | Portfolio-first canvas organized around Gartner's four levels of analytics maturity: descriptive (KPI strip) → diagnostic (lane-grouped cards) → predictive (pending follow-ups) → prescriptive (Nelson's drafts). Floating glass chat with **streaming reasoning trace**. Inline approve/reject. |
| **Telegram bot** | Same Nelson on your phone. Type a customer name → get the card with all 9 action buttons. Approve drafts inline. Edit drafts by replying with feedback. Slash commands for `/risk`, `/actions`, `/find`, etc. |

Both surfaces share session memory and the same `pending_actions` queue.

## Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI · DuckDB · Pydantic · Python 3.11+ |
| AI | Google Gemini 2.5 Flash · multi-step function-calling · streaming over SSE |
| Frontend | Next.js 14 · React 18 · TypeScript · Tailwind CSS |
| Data | 2,000 customers · 15 tables · ~28 MB (synthesized + repaired from two Kaggle datasets) |
| Memory | DuckDB tables (`nelson_sessions`, `nelson_messages`) |
| Action queue | DuckDB `pending_actions` + `human_decisions` |

## Quickstart

### Prerequisites
- **Python 3.11+** and **Node 18+**
- A **Google Gemini** API key (free tier works) — https://aistudio.google.com/apikey
- *(optional)* A **Telegram bot** token from `@BotFather`

### Setup

```bash
# 1. Clone
git clone https://github.com/<your-username>/nelson-ai.git
cd nelson-ai

# 2. Configure env
cp .env.example .env
# Open .env and paste your GEMINI_API_KEY (and TELEGRAM_BOT_TOKEN if you want the bot)

# 3. Install Python deps
pip install -e ".[dev]"

# 4. Build the database from the bundled CSVs (idempotent)
#    Windows cmd:   set PYTHONPATH=backend && python -m nelson.cli build-data
#    PowerShell:    $env:PYTHONPATH="backend"; python -m nelson.cli build-data
#    macOS/Linux:   PYTHONPATH=backend python -m nelson.cli build-data

# 5. Run the backend (also starts the Telegram bot in-process if a token is set)
python -m nelson.cli serve

# 6. In a second terminal, run the frontend
cd frontend
npm install
npm run dev
```

Then open **http://localhost:3000** and log in with `demo@nelson.ai` / `demo` (the dev credentials in `.env`).

### CLI commands

```bash
python -m nelson.cli build-data           # rebuild nelson.duckdb from CSVs
python -m nelson.cli smoke                # quick read-test of the data layer
python -m nelson.cli ask "<question>"     # ask Nelson via the CLI
python -m nelson.cli brief                # generate a portfolio morning brief
python -m nelson.cli serve                # FastAPI + Telegram bot in-process
python -m nelson.cli eval [N] [seed]      # holdout eval (default N=30, seed=42)
```

## Where the AI System Design Elements live

Nelson exhibits **five** of the eight elements the IS 303 rubric accepts. Each is named, located, and visible in operation:

| # | AI design element | Where | Visible in operation |
|---|---|---|---|
| 1 | **Multi-step workflow / orchestration** | `backend/nelson/ai/agent.py` | Watch a chat reply: Nelson chains 3–6 tool calls per question (e.g. `find_customer` → `get_customer_profile` → `get_recent_tickets` → `propose_action`). |
| 2 | **Tool calling** | `backend/nelson/ai/tools.py` | 15 typed Python tools the agent can invoke. Streaming trace in the chat widget shows each call with its arguments and result summary. |
| 3 | **Structured outputs** | `backend/nelson/eval.py` (response_schema) · `backend/nelson/data/schemas.py` (pydantic) | Eval predictions are JSON-schema-validated; data reads are pydantic-typed at every boundary. |
| 4 | **Memory across sessions** | `nelson_sessions` and `nelson_messages` DuckDB tables | Telegram and dashboard remember your conversation context across turns and across sessions. |
| 5 | **Traceable evidence / audit trail** | `pending_actions` + `human_decisions` DuckDB tables · Right-rail "Decided" tab in the dashboard | Every drafted action, every approval/rejection, with attribution and timestamp. Visible in real time. |

Two more elements are partially supported (deterministic downstream logic on model output, simulation/synthetic-respondent eval).

## Evaluation

Nelson is graded against **2,583 real human decisions** in `customer_review_logs` (the dataset ships with labeled ground-truth outcomes).

```bash
python -m nelson.cli eval 30
```

Output goes to `eval/reports/eval_<timestamp>.md` and `.json`, with:

- **Decision agreement** — Nelson's predicted decision vs the human label
- **Outcome alignment** — agreed OR vindicated by reality (`review_outcomes.follow_up_required`)
- **Confusion matrix** + **disagreement analysis** (Nelson vindicated / human right / under-call)
- **Per-customer detail** with rationale and citation count

The bundle passed to Nelson **strips pre-computed risk/decision fields** — Nelson must reason from raw evidence (orders, tickets, notes, emails, fulfillment events, prior reviews). No leakage.

## Project structure

```
nelson_ai/
├── backend/
│   └── nelson/
│       ├── api/               # FastAPI routes + auth middleware
│       ├── data/              # DuckDB, pydantic schemas, repositories, build script
│       ├── ai/                # Nelson the agent — prompts, tools, streaming, telegram
│       ├── config/            # env-driven settings
│       ├── eval.py            # holdout evaluation harness
│       └── cli.py             # `nelson <command>`
├── frontend/                  # Next.js 14 dashboard
│   ├── app/                   # layout · login · dashboard
│   └── src/
│       ├── components/        # KPIStrip · DiagnosticCanvas · RightRail ·
│       │                      # ChatWidget · CustomerTimeline · AccountDrawer ·
│       │                      # AccountCard · RiskGauge · DashboardControls · ...
│       └── lib/               # API client · types · format helpers
├── data/
│   ├── customer_2000/         # 15-table canonical dataset (~28 MB)
│   ├── data_dictionary/       # schema documentation
│   ├── AUDIT_REPORT.md        # data quality audit
│   └── REPAIR_LOG.md          # documented repairs (5 fixes — see below)
├── scripts/
│   ├── audit_data.py          # data-quality audit
│   └── repair_data.py         # idempotent 5-fix repair pipeline
├── eval/reports/              # eval outputs (committed)
├── docs/
│   ├── PROJECT_STATEMENT.md
│   ├── DATA_STATEMENT.md
│   └── SLIDE_DECK.md
└── README.md
```

## Why this design

- **Customer names everywhere user-facing.** No human memorizes `C000037`. Chat, dashboard, and briefings speak in names; IDs live only in logs and audit trails.
- **Multi-tenant from day one.** Every spine table has `tenant_id`. Demo runs as one tenant; another company can plug in their data without a refactor.
- **Human-in-the-loop on every action.** Nelson drafts; the human approves. The codebase has *no* execute path that bypasses the queue.
- **Data is repaired, not pretended-clean.** `data/AUDIT_REPORT.md` documents the issues found in the merged Kaggle datasets. `data/REPAIR_LOG.md` documents every fix. Originals are snapshotted in `data/customer_2000/.bak/` so the repair script is idempotent and reversible.
- **Eval against ground truth, not vibes.** 2,583 labeled reviewer decisions in the dataset are the validation set. Nelson's recommendations are scored against them — both on label match and on outcome alignment.
- **Lean code, structured.** Each layer has one job: API doesn't know about Gemini · agent doesn't write SQL · repositories don't know about HTTP. Swap Gemini for Claude or DuckDB for Postgres without rewriting anything.

## License & data attribution

Source code is for educational use (IS 303 final project, Spring 2026).

Customer data is synthesized from two public Kaggle datasets:
1. **DataCo Smart Supply Chain Dataset** (CC BY-SA 4.0) — orders, fulfillment, customer roster
2. **Customer Support Tickets Dataset** (CC0) — support volume + sentiment

Merged into the `customer_2000` spine via deterministic mapping rules. Synthesized layers (notes, emails, reviews, outcomes, engagement) are flagged with `synthetic_flag = "true"`. See `data/customer_2000/DATA_SOURCE_AND_LICENSE.md` for full attribution.
