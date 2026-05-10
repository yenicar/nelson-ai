# Nelson AI — Data Statement

## Source datasets

Nelson uses synthesized B2B operational data merged from two public Kaggle datasets:

| Dataset | Source | License | Used for |
|---|---|---|---|
| DataCo Smart Supply Chain | https://www.kaggle.com/datasets/shashwatwork/dataco-smart-supply-chain-for-big-data-analysis | CC BY-SA 4.0 | Orders, order lines, customers, fulfillment, geography |
| Customer Support Tickets | https://www.kaggle.com/datasets/suraj520/customer-support-ticket-dataset | CC0 1.0 (Public Domain) | Support tickets, ticket priorities, sentiment, resolution |

Both were downloaded once and the relevant CSVs included in `data/customer_2000/`. The merge logic and synthesized layers were authored as part of this project.

## How the merge works

1. **Customer roster**: 2,000 customers sampled from the DataCo customer set, stratified across segments and regions. IDs reissued as `C000001`–`C002000` for stability.
2. **Order history**: every order from those 2,000 customers, with derived columns (`days_scheduled`, `days_actual`, `delivery_status`, `late_delivery_risk`, `issue_flag`).
3. **Support tickets**: support volume from the second dataset, distributed across customers proportional to risk score (high-risk customers receive more tickets, healthy customers receive fewer or none — see `data/REPAIR_LOG.md` for the algorithm).
4. **Synthesized layers** (clearly flagged with `synthetic_flag = "true"`):
   - `customer_notes` — internal review notes per customer scenario
   - `customer_email_logs` — customer-success email threads
   - `customer_review_logs` — reviewer decisions with `human_decision` (Monitor / Stabilize / Escalate)
   - `review_outcomes` — outcome status, follow-up flags
   - `engagement_events` — campaign opens, click-throughs
   - `customer_adjustments` — credits/refunds tied to tickets
   - `customer_contacts` — multiple contacts per customer with influence levels
5. **Lineage tables**:
   - `customer_bridge` — maps original DataCo IDs to Nelson IDs with mapping confidence
   - `customer_support_bridge` — maps original support-ticket IDs to assigned customers
   - `source_signal_ids` (column on notes/emails) — points back to specific tickets/orders that triggered the note

## Final shape

| Table | Rows | Synthesized? |
|---|---:|---|
| customers | 2,000 | partial (synthesized risk_score, lifecycle_stage, churn_risk_reason, next_best_action) |
| customer_bridge | 2,000 | no (lineage only) |
| customer_contacts | 6,049 | yes (100%) |
| customer_adjustments | 1,198 | partial |
| customer_email_logs | 11,462 | yes (100%) |
| customer_notes | 6,014 | yes (100%) |
| customer_review_logs | 2,582 | yes (100%) — the eval ground truth |
| customer_support_bridge | 2,000 | no (lineage only) |
| engagement_events | 7,516 | yes |
| fulfillment_events | 9,102 | partial |
| order_lines | 50,353 | no (DataCo) |
| orders | 15,308 | no (DataCo) |
| review_outcomes | 2,582 | yes (100%) — eval validation |
| support_tickets | 2,000 | no (CST) — redistributed across customers |

Total: ~120,000 rows / ~28 MB. The full data layer is committed to the repo so the project is reproducible without external downloads.

## Data quality audit and repair

The merged dataset had four real issues that would have made Nelson hallucinate or contradict itself. These were audited (engineering-grade and human-grade) and fixed with a single deterministic script.

| Issue | Fix |
|---|---|
| **Fractured timeline** — DataCo orders dated 2015–2017, support tickets dated 2020–2022, synthetic layers dated 2026; review outcomes all dated *in the future* | Single-timeline rebase: most recent order → 30 days ago, support tickets → past 12 months, outcomes split 80/20 between completed (rebased into past) and pending (NULL) |
| **Broken support-ticket timestamps** — `first_response_time` and `time_to_resolution` columns were corrupt timestamps from string-to-date parsing | Dropped the broken columns; kept `resolution_time_hours` which is correct |
| **Missing email lineage** — `customer_email_logs.source_signal_ids` was 100% empty | Backfilled by matching `(customer_id, scenario, topic)` across notes → emails (now 100% resolve) |
| **Uniform volume per customer** — every customer had exactly 8 notes / 14 emails regardless of risk | Sampled down so volume correlates with risk_band (low: 1–4 notes, mid: 4–8, high: 8–12) |
| **One ticket per customer** — original support dataset was 1:1-mapped to customer roster | Redistributed so high-risk customers carry 3–8 tickets, ~70% of healthy customers carry 0 |

Originals are snapshotted at `data/customer_2000/.bak/` and the script is idempotent — `python scripts/repair_data.py` always reads from the snapshot, so you can re-run after editing the script.

Full audit at `data/AUDIT_REPORT.md`. Full repair log at `data/REPAIR_LOG.md`.

## How the project uses the data

The data flows through three transformations:

1. **Build** (`backend/nelson/data/build.py`): each CSV → a DuckDB table, with `tenant_id` injected on every spine table. Schema enforced via `REQUIRED_COLUMNS` validation — drift fails loud at load.
2. **Repository layer** (`backend/nelson/data/repositories.py`): typed query helpers return pydantic models, never raw rows. Every query is tenant-scoped.
3. **Tool layer** (`backend/nelson/ai/tools.py`): the agent's tools call repositories, returning slim dicts the LLM can reason over.

For evaluation (`backend/nelson/eval.py`), `customer_review_logs.human_decision` is treated as **ground truth**. A stratified random sample is held out, Nelson predicts a decision purely from the customer's evidence bundle (no leakage of the answer), and predicted vs actual are scored.

## Privacy and PII

The source datasets contain plausibly-realistic-looking but fictional customer data — names, addresses, emails. No real customer information is present. The `customer_email` column was masked to `XXXXXXXXX` in the source DataCo dataset.

The system records human decisions in `human_decisions` with the operator's email as `decided_by`. In a production deployment, this would be subject to standard data-retention and access-control policies. For this educational deployment, all data is local-only and unencrypted.

## Reproducibility

To recreate the data layer from the committed CSVs:

```bash
set PYTHONPATH=backend
python -m nelson.cli build-data
```

This creates `backend/nelson.duckdb` and is idempotent. The audit and repair scripts can be re-run any time:

```bash
python scripts/audit_data.py     # writes data/AUDIT_REPORT.md
python scripts/repair_data.py    # reads .bak/, writes corrected CSVs, writes data/REPAIR_LOG.md
```
