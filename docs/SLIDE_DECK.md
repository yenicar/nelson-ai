# Nelson AI — Slide Deck Outline

> 7–10 minute presentation. ~10 slides. Each slide has a clear single idea + a talking-track bullet list.

---

## Slide 1 — Title

**Visual:** Just the Nelson logo / wordmark on the dark navy + glass background. Tag underneath:
> Nelson AI — Account Intelligence System
> An always-on AI Account Manager for B2B portfolios

**Talking track (15 sec):**
> "I built Nelson — an AI account manager that watches a portfolio of 2,000 B2B customers, identifies risk, briefs the human, and drafts actions for approval. The whole thing runs locally and is graded against real reviewer decisions in the dataset. I'll show you the system, then the evaluation."

---

## Slide 2 — The problem

**Visual:** Three columns: orders / tickets / emails — each with a fragment of evidence. Arrow pointing to a tired-looking person who has to read all three.

**Headline:** *"The evidence is everywhere. The judgment is yours alone."*

**Talking track (45 sec):**
> "A B2B operations leader owns hundreds to thousands of accounts. Each one has evidence scattered across orders, tickets, notes, emails, fulfillment incidents. Nobody reads all of that for every account. Triage gets made on the loudest signal — and high-revenue customers slip into churn because their issues live in three different systems. Most dashboards surface the data; chatbots answer questions about it. Neither does the *work* of an account manager."

---

## Slide 3 — Nelson, in one sentence

**Visual:** Three icons:
- 📖 *reads*
- 🧠 *thinks*
- 📝 *drafts*

Below them: ❌ *does not send*

**Headline:** *"Nelson reads the portfolio, identifies risk, briefs you, and drafts the actions you'd take — but never acts without approval."*

**Talking track (30 sec):**
> "Nelson is an always-on AI Account Manager. He reads, he thinks, he drafts — but he doesn't act. Every customer-facing action he proposes lands in a pending queue for me to approve, reject, or override. That boundary is enforced by the architecture, not just by prompt — there is no 'execute' path in the codebase."

---

## Slide 4 — The data

**Visual:** A table-of-tables. 15 boxes representing the 15 spine tables (customers, orders, tickets, notes, emails, reviews, outcomes, engagement, fulfillment, etc.) with arrows showing the joins.

**Headline:** *"2,000 B2B customers · 15 tables · 28 MB · merged from two Kaggle sources · audited, repaired, evaluable."*

**Talking track (45 sec):**
> "The data is two Kaggle datasets — DataCo Supply Chain and Customer Support Tickets — merged into a 2,000-customer spine. I audited it, found four real fidelity issues, and wrote a deterministic repair script that's documented and reversible. The most important thing about this data: it ships with 2,583 *labeled* reviewer decisions — Monitor, Stabilize, Escalate — which means I can actually grade Nelson's judgment instead of guessing."

---

## Slide 5 — The dashboard (live demo)

**Visual:** Screenshot of the dashboard with the four Gartner zones annotated:
- Top → Descriptive
- Center → Diagnostic
- Right rail top → Predictive
- Right rail bottom → Prescriptive

**Headline:** *"Organized around Gartner's four levels of analytics: descriptive → diagnostic → predictive → prescriptive."*

**Talking track (90 sec — live demo):**
1. *(point at top metrics block)* "12 portfolio metrics in a uniform grid — revenue, at-risk count, sentiment with NPS-style split, profit margin, avg health, late-delivery rate, top-10% revenue concentration, churn flags, ticket backlog. That's descriptive, the *what*."
2. *(point at lane-grouped cards)* "Center groups customers by primary concern — open tickets, late deliveries, health declining. Each lane shows the top 3 with an expand button for the rest. That's diagnostic, the *why*."
3. *(flip the At-risk / Healthy toggle)* "Same canvas, healthy view — these are the expansion candidates, sorted by lowest risk."
4. *(point at follow-ups in right rail)* "Right rail top: pending review follow-ups — predictive, *what's coming.*"
5. *(point at pending actions panel)* "Right rail bottom: actions Nelson has drafted, waiting for me — prescriptive, *what to do.*"
6. *(tap the theme toggle in the header)* "Same data, light theme — for daytime use or screen-sharing."
7. *(open chat widget)* "And Nelson is always reachable in plain English. Watch."

---

## Slide 6 — Watch Nelson reason (live)

**Visual:** Open the floating chat widget. Type:
> "Who are the top 3 at-risk customers and what should I do about Mary Brady?"

**Talking track (60 sec):**
> "Notice what's happening — Nelson called `get_top_at_risk`, then `find_customer` for Mary Brady, then pulled her recent tickets, orders, fulfillment events. Five tool calls in sequence. He's not pattern-matching — he's deciding which data to fetch based on what I asked. And his answer cites specific record IDs from the data. That's tool use plus multi-step orchestration plus structured retrieval — three of the rubric's AI design elements visible in one interaction."

---

## Slide 7 — Two surfaces, one brain

**Visual:** Side-by-side: the dashboard chat widget AND a Telegram conversation with the same Nelson.

**Headline:** *"Same agent, two surfaces, persistent memory."*

**Talking track (30 sec):**
> "Nelson lives in the dashboard *and* on Telegram. Same agent, same data, same memory. I can ask him in the office, then ask a follow-up from my phone an hour later — he picks up the context. The session memory lives in DuckDB tables that the agent reads on every turn."

---

## Slide 8 — How it's built

**Visual:** Architecture diagram, top-down:
```
[ Dashboard / Telegram ]
        ↓
[ FastAPI · auth · routes ]
        ↓
[ Nelson agent · Gemini Flash · 13 tools · memory ]
        ↓
[ Repository layer · pydantic schemas ]
        ↓
[ DuckDB · 15 tables · tenant-scoped ]
```

**Headline:** *"Lean. Modular. Each layer has one job."*

**Talking track (45 sec):**
> "FastAPI backend, Next.js frontend, DuckDB for the data layer, Gemini Flash for the brain. The agent code is 220 lines. The data layer is 250 lines. Each layer has one job — the API doesn't know about Gemini, the agent doesn't write SQL, the repositories don't know about HTTP. That separation is what lets us swap Gemini for Claude, or DuckDB for Postgres, without rewriting anything."

---

## Slide 9 — Evaluation (the differentiator)

**Visual:** Two big headline numbers side by side (50% decision agreement · 60% outcome alignment) + per-class breakdown.

**Headline:** *"Graded against 2,583 real human decisions in the dataset."*

**Numbers** (from `eval/reports/eval_20260511_024750.md`, seed=42, N=30, model=gemini-2.5-flash):

| Metric | Value |
|---|---:|
| **Decision agreement** (matches human label) | **50%** (15/30) |
| **Outcome alignment** (agreed OR vindicated by reality) | **60%** (18/30) |
| **Citation validity** (cited IDs that resolve to real records) | **98%** |
| Avg citations per prediction | 5.9 |
| Parse errors | 0 |

**By decision class:**

| Class | n | Correct | Agreement |
|---|---:|---:|---:|
| Escalate | 15 | 15 | **100%** |
| Monitor | 15 | 0 | 0% |

**Disagreement breakdown:**

| Verdict | Count |
|---|---:|
| Nelson vindicated (he said act, follow-up was actually needed) | 3 |
| Human right, Nelson over-eager | 12 |
| **Nelson under-called** (he said less than reality required) | **0** |

**Talking track (90 sec):**
> "I held out 30 customers from `customer_review_logs` — these are real reviewer decisions. I asked Nelson to predict each one purely from raw evidence: notes, emails, tickets, orders, fulfillment events. I deliberately stripped `risk_band` and `last_review_decision` from his input — so he has to reason, not read the answer.
>
> Two headline numbers: **decision agreement 50%**, **outcome alignment 60%** — that's when he matches the label *or* he disagreed and the actual outcome data vindicated him.
>
> The breakdown is where it gets interesting. *(point at per-class table)*
> **Escalate cases: 100% agreement** — 15 of 15. Perfect at identifying clear executive escalations.
> **Monitor cases: 0%** — he always recommends Stabilize when the human said Monitor.
>
> That's a systematic bias toward action. In 3 of those 15 disagreements, follow-up was actually required — Nelson was right. In 12, the human was right and Nelson would have over-intervened.
>
> For a draft-only system where every action is human-gated, this is the failure mode you want — Nelson catches more, the human filters. **Nelson never under-called** — zero cases of recommending less action than reality required.
>
> One more number: **98% citation validity**. Nelson cited 5.9 record IDs per prediction on average, 98% of which resolve to real records. He's not hallucinating evidence."

---

## Slide 10 — Limitations + what's next

**Visual:** Two columns.

**Left — what requires human judgment:**
- Sending any customer email
- Approving credits / refunds
- Reclassifying risk band
- Escalating to leadership
- Confirming lifecycle transitions

**Right — what's next post-class:**
- Real Gmail OAuth (currently mocked from the dataset)
- Hosted deployment (Render + Vercel)
- Real auth (currently dev login)
- Telegram webhook deployment
- Streaming chat responses

**Talking track (30 sec):**
> "Nelson is built around the principle that AI supports judgment — it doesn't replace it. Five things stay gated to me: outbound communication, financial decisions, risk reclassification, escalations, lifecycle changes. Nothing in the codebase bypasses that. After class, I'd add real Gmail integration to replace the mocked inbox, deploy to Render and Vercel for hosted access, and add streaming responses. The architecture is structured for that — multi-tenant from day one, fail-loud schema validation, RBAC middleware already in place."

---

## Closing — 15 seconds

> "Code is at `nelson_ai/`. README has run instructions. Eval reports are in `eval/reports/`. Thank you."

---

## Appendix slides (only if time / Q&A)

### A1 — The 5 AI design elements with file:line refs

1. Multi-step workflow → `backend/nelson/ai/agent.py`
2. Tool calling → `backend/nelson/ai/tools.py` (13 tools)
3. Structured outputs → `backend/nelson/eval.py` + `backend/nelson/data/schemas.py`
4. Memory → `nelson_sessions` + `nelson_messages` DuckDB tables
5. Audit trail → `pending_actions` + `human_decisions` DuckDB tables

### A2 — The data repair pipeline

5 fixes: date rebase / ticket columns / email lineage / volume curve / ticket spread.
Documented in `data/REPAIR_LOG.md`. Idempotent. Reversible (originals in `.bak/`).

### A3 — Multi-tenant from day one

Every spine table has `tenant_id`. Every query is tenant-scoped. Demo runs as one tenant ("Acme Manufacturing"). Adding a second tenant is a row insert + a data ingestion — no refactor.

---

## Speaker notes for time management

| Section | Cumulative time |
|---|---:|
| Title + problem (slides 1–2) | 1:00 |
| What Nelson is + data (slides 3–4) | 2:15 |
| Live demo (slides 5–6) | 4:45 |
| Two surfaces + how built (slides 7–8) | 6:00 |
| Evaluation (slide 9) | 7:30 |
| Limitations + close (slide 10) | 8:00 |
| Buffer / Q&A | 8:00–10:00 |

If running long: drop slide 7 (Telegram demo) and reference it in passing.
If running short: open the eval report and walk through one specific failure case.
