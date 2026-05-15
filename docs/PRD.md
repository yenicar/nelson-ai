# Nelson AI — Product Requirements Document

**Status:** v1 shipped · IS 303 Spring 2026 final
**Author:** Reverse-engineered from the codebase at commit `4197794`
**Last updated:** 2026-05-14

---

## 1. Summary

**Nelson AI** is an always-on AI Account Manager for B2B portfolios. It reads scattered customer evidence (orders, tickets, notes, emails, fulfillment events, engagement), identifies which accounts need attention and why, briefs the human, and drafts the actions a human would take — but never executes anything customer-facing without an explicit human approval.

Two surfaces, one brain:
- **Web dashboard** (Next.js) for desk work — analytics, lane-grouped triage, drafting queue.
- **Telegram bot** for phone work — same agent, button-driven, approve in-thread.

Both surfaces share session memory (`nelson_sessions`, `nelson_messages`) and the same `pending_actions` queue.

---

## 2. Problem statement

A senior B2B operations leader — Chief Customer Officer, CS ops manager, BI analyst on a portfolio team — owns hundreds to thousands of accounts. Evidence for each account lives in 5–7 disconnected systems. Nobody has time to read all of it for every account, so triage gets made on the loudest signal and the freshest emotion. High-revenue customers slip into churn because their issues live in three different systems.

A traditional dashboard surfaces the data. A chatbot answers questions about it. **Neither does the work of an account manager.**

---

## 3. Goals and non-goals

### Goals
1. **Surface portfolio risk** — group all 2,000 customers by *primary concern* (open critical tickets, late-delivery risk, health declining, watch list), not just by name.
2. **Reason over scattered evidence** — Nelson can chain tool calls across orders, tickets, notes, emails, engagement, and fulfillment events to ground every recommendation.
3. **Draft, never act** — every customer-facing or system-mutating action queues for human approval with a rationale and confidence score.
4. **Audit everything** — every Nelson draft, every human decision (approve/reject/edit), with attribution + timestamp.
5. **Be evaluable** — score Nelson against the 2,583 real human review decisions shipped with the dataset.
6. **Two surfaces** — dashboard for desk, Telegram for phone, shared session memory, shared queue.

### Non-goals (v1)
- Real OAuth / SSO (uses session cookies + a single demo password).
- Multi-tenant isolation past schema-level `tenant_id` (no row-level security, no per-tenant deploys).
- Sending real emails to real customers in scale (Gmail SMTP path exists but only sends approved drafts from the configured account).
- Time-series trends (NPS over time, sentiment over weeks). Dataset has no daily snapshots.
- Hosted multi-user deployment. Runs locally for the IS 303 demo.

---

## 4. Users and personas

| Persona | Surface | Primary jobs |
|---|---|---|
| **Portfolio operator** (CCO / CS ops lead) | Dashboard | Morning triage, approve drafts, review pending follow-ups, drill into accounts |
| **Mobile reviewer** | Telegram | Approve drafts on the go, look up an account by name, get a morning briefing |
| **Analyst / evaluator** | CLI + eval reports | Run `eval` against ground-truth review decisions, audit Nelson's agreement and outcome alignment |

---

## 5. Functional requirements

### 5.1 Data layer
- **15 tables**, ~2,000 customers, ~28 MB, in DuckDB (`nelson.duckdb`).
- Multi-tenant: every table has `tenant_id`. Default tenant: `demo-tenant`.
- Idempotent build: `python -m nelson.cli build-data` reads CSVs from `data/customer_2000/` and rebuilds the DB.
- Pydantic-typed schemas in `backend/nelson/data/schemas.py`.
- Repository pattern in `backend/nelson/data/repositories.py` — `AccountsRepo`, `OrdersRepo`, `TicketsRepo`, `NotesRepo`, `EmailsRepo`, `EventsRepo`, `OutcomesRepo`, `ActionsRepo`.

### 5.2 Agent core
- **Model:** Google Gemini 2.5 Flash (configurable via `GEMINI_MODEL`).
- **Two execution paths:**
  - `ask()` — synchronous, uses `automatic_function_calling`, returns final text. Used by Telegram and CLI.
  - `stream_ask()` — async generator, manual tool-call loop, streams reasoning trace + tool calls + final text over SSE. Used by the dashboard chat widget.
- **15 tools** (tenant-scoped via closure factory, never expose `tenant_id` to the LLM):
  1. `find_customer(name)` — fuzzy name lookup with disambiguation
  2. `get_customers_by_ids(customer_ids)` — CSV of IDs → profiles
  3. `get_customer_profile(customer_id)` — full profile + risk metrics
  4. `get_recent_orders(customer_id, limit)` — order history
  5. `get_recent_tickets(customer_id, limit)` — support history
  6. `get_recent_notes(customer_id, limit)` — internal notes
  7. `get_recent_emails(customer_id, limit)` — email threads
  8. `get_engagement_events(customer_id, limit)` — campaign opens/clicks
  9. `get_fulfillment_issues(customer_id, limit)` — delivery incidents
  10. `get_top_at_risk(limit, band)` — risk-sorted top-N
  11. `get_top_by_revenue(limit, ascending)` — revenue-sorted top-N
  12. `search_customers_by_prefix(prefix, limit)` — name-prefix search
  13. `get_portfolio_summary()` — portfolio-wide aggregates
  14. `get_pending_review_outcomes(limit)` — predictive follow-ups
  15. `propose_action(customer_id, action_type, payload_json, rationale, confidence)` — **the only write tool**
- **Tool safety:** every tool is wrapped with `_safe_tool` which pins `__signature__` + `__annotations__`, catches exceptions, returns `{"error": "..."}` to the model so failures are visible upstream.
- **Memory:** conversation history persists in `nelson_messages`, scoped by `nelson_sessions`. Both Telegram and dashboard load + save messages on every turn.

### 5.3 Action queue (the human-in-the-loop boundary)
- **8 action types** (`PendingAction.action_type`):
  - `send_email`, `proactive_outreach`, `reclassify_band`, `update_lifecycle`, `escalate`, `schedule_followup`, `recommend_credit`, `recommend_expedite`
- **Lifecycle:** `pending` → `approved` | `rejected` (`executed` reserved for the email send path).
- **On approval** of a `send_email` action: routed through `decide_action` → `send_email` via Gmail SMTP (app password). `sent_at` or `send_error` recorded on the action row.
- **All decisions** write a `human_decisions` row with `decided_by`, `decided_at`, optional notes, and the related action ID.
- **Edit path:** dashboard supports `PATCH /api/actions/{id}` to mutate `payload_json` before approval. Telegram supports "Edit" → user replies with guidance → Nelson drafts a revision (rejects the old, creates a new pending action).

### 5.4 Dashboard surface

#### Layout (top to bottom)
1. **AppHeader** — greeting, pending-action notification bell with dropdown, theme toggle (dark navy ↔ light purple), at-risk summary chips.
2. **Metrics block** — 3 rows × 4 columns, perfectly aligned grid:
   - Row 1 (KPIs): Revenue · At-risk count · Sentiment (with NPS-style promoter/passive/detractor split bar) · Action queue
   - Row 2 (economics): Avg deal size · Profit margin · Avg health · Risk distribution
   - Row 3 (operations): Late delivery rate · Top-10% revenue concentration · Churn flags · Ticket backlog
3. **DashboardControls** — segmented `At risk ↔ Healthy` view toggle · server-backed search across all 2,000 customers · band filter pills (Critical/High/Moderate/Low, hidden in Healthy view).
4. **DiagnosticCanvas** — accounts grouped into 4 lanes by primary concern. Each lane shows 3 featured cards with a centered "Show N more accounts" expand button that reveals the rest inline as a 3-col grid.
5. **RightRail** (340px fixed column):
   - **Predictive tab:** pending review follow-ups
   - **Prescriptive tab:** pending actions Nelson has drafted (approve/reject/edit inline) and decided actions (audit log)
6. **ChatWidget** — floating glass chat. Streams reasoning trace + tool calls + final text. Edit drafts inline, approve from chat.

#### Other views
- **CustomersView** — paginated server-side browse of all 2,000 customers, client-side sort + band filter.
- **ActionsView** — Pending and Decided action tabs as a full-screen list.
- **AccountDrawer** — slide-over with the full customer profile + timeline.

#### Themes
- Two themes: `dark` (default, navy + liquid glass) and `light` (off-white + purple gradient + uplift shadows).
- Persisted in `localStorage` (`nelson-theme`).
- Pre-paint script in `<head>` sets `data-theme` before React mounts → no FOUC.
- Tailwind utility overrides in `globals.css` for all `text-white/*`, `bg-white/*`, `border-white/*`, `placeholder-white/*`, `ring-white/*`, `hover:*` variants.
- Typography auto-adjusts: small-text gets `font-weight: 500` and tighter tracking in light mode; risk colors swap to WCAG-contrast-safe deeper hues.

### 5.5 Telegram surface
- Long-polling bot (no webhook).
- **Slash commands** registered in Telegram's `/` menu:
  - `/brief` — morning portfolio briefing
  - `/risk` — top 10 at-risk customers (button list)
  - `/find <name>` — customer lookup with disambiguation
  - `/actions` — pending action queue (button list)
  - `/pending` — pending review follow-ups (AI-generated summary)
  - `/portfolio` — portfolio summary stats
  - `/diag` — self-test (API key + DB + tools + agent round-trip)
  - `/help`, `/start`
- **Auto-detection:** plain-text messages that look like a customer name (≥2 capitalized words, no punctuation) → skip the LLM and send the customer card directly.
- **Customer card** — risk band emoji, name, customer ID, profile chunk (revenue, profit, late %, open tickets, lifecycle, why-on-radar), and 9 action buttons (Email, Outreach plan, Escalate, Add note, Follow-up, Expedite, Credit, Reclassify, Stage) plus Recent activity.
- **Approve / reject / edit** flow:
  - Approve: callback → `decide_action` → if `send_email`, SMTP send. Card edits in place to show ✓ APPROVED / 📧 SENT.
  - Reject: same shape, marks rejected.
  - Edit: bot enters "edit mode" for that action, user's next message becomes the revision guidance.
- **Authorization:** `TELEGRAM_ALLOWED_USER_IDS` allow-list (empty = open).
- **Error resilience:**
  - Markdown send failures fall back to plain text automatically.
  - Callback errors send the exception class + message + callback data to the chat, not just a toast.
  - Startup sanity check prints warnings to stderr for missing API key or empty DB.

### 5.6 Auth
- Session cookie (`nelson_session`) issued at `/api/auth/login`.
- Single demo user in `.env` (`DEMO_USER_EMAIL`, `DEMO_USER_PASSWORD`).
- All non-auth, non-health routes require `require_session` dependency.

### 5.7 Eval harness
- `python -m nelson.cli eval N` runs Nelson against `N` rows sampled from `customer_review_logs` (2,583 labeled rows total).
- **Leakage prevention:** bundle strips `risk_band`, `risk_score`, `last_review_decision`, `next_best_action` before Nelson sees it.
- **Metrics emitted:**
  - Decision agreement (Nelson's predicted class vs human label)
  - Outcome alignment (agreed OR vindicated by `review_outcomes.follow_up_required`)
  - Confusion matrix
  - Disagreement breakdown (Nelson vindicated / human right / under-call)
  - Per-customer detail (rationale, citations, tool-call count)
- Output: `eval/reports/eval_<timestamp>.md` + `.json`.

---

## 6. Non-functional requirements

### Performance
- Dashboard initial load: single `/api/portfolio/dashboard` call (~60 accounts, summary, sentiment, follow-ups, pending actions) — should return in <1 s for 2,000-customer dataset.
- Chat first token (streaming): <2 s p50 on Gemini 2.5 Flash with 5-tool chain typical.
- Telegram round-trip: button-tap → reply <8 s p90 (Gemini + tool chain).

### Reliability
- Backend continues to serve non-AI routes if `GEMINI_API_KEY` is missing.
- Telegram bot continues to serve non-AI slash commands if Gemini is down.
- DB migrations run automatically on first connection (`_apply_migrations` in `db.py`).
- Pre-paint theme script avoids FOUC on cold reload.

### Security
- No customer data leaves the local machine except via the LLM (Gemini API) and Telegram (when configured).
- Gmail SMTP path uses an app password, not full OAuth — restricted to the configured `GMAIL_FROM` account.
- Tenant isolation enforced at every repository query (mandatory `tenant_id` filter).

### Observability
- All tool calls log `[tool] -> name(args)` and `[tool] <- name result_summary` to stderr.
- Tool crashes print full traceback.
- Telegram interactions log `chat_id`, `user_id`, message text, and outcome.
- Streaming chat emits structured `tool_call`, `tool_result`, `text`, `done` events the frontend renders as a live trace.

### Maintainability
- Layer separation: API doesn't import Gemini; agent doesn't write SQL; repositories don't know about HTTP.
- Pydantic at every boundary (API request/response, DB read, tool args where SDK supports it).
- Single source of truth for decision side-effects: `nelson.services.actions.decide_action` is used by both the HTTP route and the Telegram callback.

---

## 7. AI System Design Elements (IS 303 rubric mapping)

| # | Element | Where | Visible in operation |
|---|---|---|---|
| 1 | Multi-step workflow / orchestration | `agent.py` `ask()` / `stream_ask()` | Streaming trace shows 3–6 tool calls per question |
| 2 | Tool calling | `tools.py` (15 tools) | Every question triggers typed Python tools |
| 3 | Structured outputs | `eval.py` (response_schema), `schemas.py` (pydantic) | Eval predictions JSON-schema validated |
| 4 | Memory across sessions | `nelson_sessions`, `nelson_messages` | Same context across Telegram + dashboard, across restarts |
| 5 | Traceable evidence / audit trail | `pending_actions` + `human_decisions` | Right rail "Decided" tab, Telegram message edits |

Two more are partially supported: deterministic downstream logic on model output, and simulation/synthetic-respondent eval against 2,583 labels.

---

## 8. Success metrics

### Product
- ≥80% **decision agreement** with human reviewers on the holdout eval set (current eval reports in `eval/reports/`).
- ≥90% **outcome alignment** (agreed OR vindicated by outcome).
- 100% of customer-facing actions pass through the queue. Verified by the absence of any direct-send code path outside `decide_action`.

### Engineering
- Dashboard initial load <1 s on the local DuckDB.
- Tool-call success rate >99% in `/diag` self-test (after the PEP 563 fix in commit `0927cc2`).
- Zero "I am unable to retrieve…" silent failures — every tool error surfaces to the user with an exception class + message.

### Learning (course)
- Five AI design elements demonstrably named, located, and visible in the deployed system.
- Eval report committed to repo with both decision agreement and outcome alignment.
- 7–10 min slide deck demoing all four Gartner zones live.

---

## 9. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| LLM hallucinates a customer name | Wrong account gets acted on | `find_customer` returns disambiguation when multiple matches; prompts in `system_prompt` mandate confirmation before drafting |
| Tool annotation drift breaks Gemini introspection | Every tool call crashes (the PEP 563 bug) | `_safe_tool` wrapper + smoke check in `/diag`; no future imports in `tools.py` |
| Email sends to wrong address | Real customer harmed | Send path is hard-gated on `approved` status + comes only from `decide_action`; SMTP errors recorded in `send_error` |
| Eval data leakage inflates decision agreement | False sense of model quality | Bundle strips `risk_band`, `risk_score`, `last_review_decision`, `next_best_action` before evaluation |
| Backend restart loses Telegram session map | Users see chat reset | `nelson_sessions` persists across restarts; only the in-process `sessions: dict[int, str]` cache rebuilds |
| Gemini API quota / outage | Buttons silently fail | `/diag` surfaces it; callback errors now report to chat; non-AI slash commands keep working |

---

## 10. What's next (post-v1)

- Real OAuth / SSO replacing the demo password.
- Row-level multi-tenant isolation past schema-level filtering.
- Daily snapshot table for time-series KPIs (real NPS-style trend, sentiment over time, churn-flag delta).
- Webhook-based Telegram (currently long-polling).
- Hosted deployment (Docker compose target + a managed Postgres swap-in for DuckDB).
- Expand action types beyond the current 8.
- Lane filter in `CustomersView` (currently lane is dashboard-only).

---

## 11. Appendix — API surface

### Auth
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`

### Portfolio
- `GET /api/portfolio/summary`
- `GET /api/portfolio/top-at-risk?limit`
- `GET /api/portfolio/top-healthy?limit`
- `GET /api/portfolio/pending-followups?limit`
- `GET /api/portfolio/sentiment`
- `GET /api/portfolio/dashboard` *(single-round-trip aggregate)*

### Accounts
- `GET /api/accounts?limit&offset&search`
- `GET /api/accounts/{customer_id}`
- `GET /api/accounts/{customer_id}/activity`

### Actions
- `GET /api/actions/pending`
- `GET /api/actions/decided?limit`
- `GET /api/actions/{action_id}`
- `PATCH /api/actions/{action_id}` *(edit payload)*
- `POST /api/actions/{action_id}/approve`
- `POST /api/actions/{action_id}/reject`

### Chat
- `POST /api/chat` *(synchronous)*
- `POST /api/chat/stream` *(SSE)*
- `GET /api/chat/sessions/{session_id}/messages`

### Health
- `GET /api/health`
