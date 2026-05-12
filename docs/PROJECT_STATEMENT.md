# Nelson AI — Project Statement

**Course:** IS 303 — AI for Business Development & Data Analytics, Spring 2026
**Submitted:** 2026-05-12

## The problem

A senior B2B operations leader — a Chief Customer Officer at a manufacturing company, a Customer Success ops manager, a BI analyst on a portfolio team — typically owns hundreds to thousands of accounts. Each one has scattered evidence across systems: orders in ERP, tickets in support, notes in CRM, emails in Outlook, fulfillment incidents in operations, engagement data in marketing. **Nobody has the time to read all of it for every account.** Triage decisions get made on the loudest signal and the freshest emotion.

The cost of this is real:
- High-revenue customers slip into churn unnoticed because their issues live in three different systems
- Reviewers re-litigate the same context every week because there's no shared lineage
- Recommended actions ("send a recovery email", "expedite the order") get verbalized in meetings but never tracked to outcome

A traditional dashboard surfaces the data. A chatbot answers questions about it. **Neither does the work of an account manager.**

## The system

Nelson is an always-on AI Account Manager built around a single job description: *read the portfolio, identify what needs attention, brief the human, and draft the actions a human would take — but never act without approval.*

Two surfaces, one brain:

- **Dashboard** at `localhost:3000` — a portfolio canvas organized around Gartner's four levels of analytics maturity (descriptive → diagnostic → predictive → prescriptive). Twelve metrics are surfaced in a uniform 3-row × 4-column grid spanning headline KPIs (revenue, at-risk count, sentiment with NPS-style split, action queue), economics (avg deal size, profit margin, avg health, risk distribution), and operational signals (late-delivery rate, top-10% revenue concentration, churn flags, ticket backlog). Cards group by *primary concern* (open critical tickets, late-delivery risk, health declining, watch list) — not just by name — and each lane has an inline expand button that reveals the rest of the lane without leaving the dashboard. A view toggle flips between at-risk customers and healthy expansion candidates. A right rail surfaces what's coming next (pending review follow-ups) and what Nelson has already drafted that needs your approval. Two themes (dark navy + light purple) ship with full typography, color, and contrast compatibility across components.
- **Telegram bot** — the same Nelson, on a phone. Morning briefings, status checks by customer name, action drafts.

The interaction model:
1. Nelson reads the data (DuckDB-backed, 2,000 customers, 15 tables, ~28 MB).
2. Nelson briefs the user on demand or proactively.
3. Nelson drafts actions (emails, outreach plans, risk reclassifications, lifecycle transitions, escalations).
4. Drafts land in a `pending_actions` queue.
5. The human approves, rejects, or overrides — that decision is recorded in `human_decisions` with attribution and timestamp.
6. Nothing reaches a customer without human sign-off.

## Why this goes beyond a chatbot

A chatbot answers questions. Nelson does **work**. The system has visible structure beyond a single LLM call:

1. **Multi-step orchestration.** Each user question triggers up to 10 sequential tool calls — `find_customer` → `get_customer_profile` → `get_recent_tickets` → `propose_action`. The model is making decisions about which tools to call, in what order, with what arguments.
2. **Tool use over a real data layer.** 15 typed Python tools backed by a DuckDB store with pydantic-validated schemas. The agent operates against structured records, not free-text retrieval.
3. **Structured outputs with validators.** Eval predictions are JSON-schema-constrained; data reads are pydantic-typed; tool outputs are dictionaries with stable contracts.
4. **Memory across sessions.** Conversation history persists in DuckDB. Closing the dashboard chat or the Telegram conversation and returning later picks up the context.
5. **Traceable audit trail.** Every Nelson-drafted action is recorded with a rationale, confidence score, and timestamp. Every human decision is recorded with attribution. The system is auditable end-to-end without log scraping.

The design also enforces a hard product boundary: **Nelson does not act on customers.** The 8 categories of action he can propose (send_email, proactive_outreach, reclassify_band, update_lifecycle, escalate, schedule_followup, recommend_credit, recommend_expedite) all queue for human approval. The system cannot bypass this — there is no "execute" path in the codebase.

## The data story

Two Kaggle datasets — DataCo Smart Supply Chain (orders + customers) and Customer Support Tickets (support volume + sentiment) — were merged into a coherent 2,000-customer spine across 15 tables. The merge introduced fidelity issues (date misalignments across three eras, broken timestamp columns, missing email-to-ticket lineage, uniform synthetic volume regardless of risk). All five issues were audited (`data/AUDIT_REPORT.md`) and repaired with a documented, reversible script (`scripts/repair_data.py`, `data/REPAIR_LOG.md`). Originals are snapshotted in `data/customer_2000/.bak/`.

Critically, `customer_review_logs` (2,583 rows) ships with `human_decision` labels and `review_outcomes` ships with outcome statuses. **This makes the dataset evaluable** — Nelson's recommendations can be scored against real reviewer decisions, not synthetic ground truth. The eval harness (`backend/nelson/eval.py`) does exactly this and emits a markdown report committed to the repo.

## What still requires human judgment

The system is built around the explicit principle that AI should **support, never replace** the operator's judgment. The following are deliberately gated to humans:

- All customer-facing communication — Nelson drafts, humans send
- All financial decisions — credit issuance, refund approval, shipping cost authorization
- All risk reclassifications — Nelson recommends, human ratifies
- All lifecycle transitions — Nelson detects, human confirms
- All escalations to leadership

Nelson's confidence score is surfaced on every drafted action so the human can prioritize their review queue.

The eval harness reveals where Nelson's judgment is unreliable (which decision classes have lower agreement, which customers Nelson mis-bands). That visibility is itself part of the deliverable: a system that knows what it doesn't know.

## What's next

The current scope is a working v1 demo. Production-readiness — real OAuth, multi-tenant isolation past the schema layer, hosted deployment, real Gmail integration replacing the mocked email layer — is scoped for the post-class iteration. The architecture is structured to absorb that work without a refactor (RBAC middleware in place, multi-tenant data model already enforced, fail-loud schema validation at load).
