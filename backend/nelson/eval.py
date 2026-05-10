"""Eval harness — Nelson vs ground truth.

Holds out a stratified random sample from `customer_review_logs` and asks
Nelson to predict the reviewer's decision (Monitor / Stabilize / Escalate)
purely from the customer's evidence bundle. Measures:

- **Decision agreement**: did Nelson's prediction match the actual human decision?
- **Citation existence**: did Nelson cite real record IDs from the bundle?
- **Confusion matrix**: where does Nelson agree and where does it deviate?

Predictions skip the agentic loop and call Gemini directly with a structured
output prompt, which is faster and cheaper for batch eval.

Run:  python -m nelson.cli eval [--limit N] [--seed N]
Out:  eval/reports/eval_<timestamp>.md  +  eval_<timestamp>.json
"""
from __future__ import annotations

import json
import random
import sys
from datetime import datetime
from pathlib import Path

from google import genai
from google.genai import types

from nelson.config.settings import ROOT, settings
from nelson.data.db import get_connection
from nelson.data.repositories import (
    AccountsRepo,
    EmailsRepo,
    EventsRepo,
    NotesRepo,
    OrdersRepo,
    ReviewsRepo,
    TicketsRepo,
)

EVAL_DIR = ROOT / "eval"
REPORTS_DIR = EVAL_DIR / "reports"

PREDICT_SYSTEM = """You are Nelson, a senior B2B account intelligence analyst.
Predict what a human reviewer would decide for this customer.

IMPORTANT: The bundle does NOT include pre-computed fields like risk_band,
risk_score, health_score, or last_review_decision. You must reason purely
from raw evidence: orders, tickets, notes, emails, fulfillment events, and
prior reviews. The customer's `prior_reviews` field (if any) shows the
human's PAST decisions on this customer — strongest predictor of their
current decision UNLESS the recent evidence shows a clear shift.

# Three options — read the rules carefully. They are not symmetric.

## "Monitor" — DEFAULT. Predict this unless rules below fire.

Reviewers choose Monitor when an account is on the radar but no SPECIFIC, RECENT
action is yet required. Even Critical-band customers are often Monitored if there
is no fresh trigger. Monitor is by far the most common decision.

Predict Monitor when ANY of these apply:
- The risk picture is stable (no new incidents in the last 30 days)
- The customer's signals are concerning but historic, not active
- Recent reviews already noted the situation and chose to wait
- There is no specific follow-up or recovery action pending
- You're uncertain between Monitor and Stabilize → choose Monitor

## "Stabilize" — ONLY when there is a SPECIFIC, RECENT, ACTIONABLE issue.

Predict Stabilize only when ALL three of these are true:
1. There is a concrete recent event (ticket from <30 days, service-recovery note,
   active customer request, recent escalation flag in notes)
2. The event has not yet been resolved or addressed
3. A specific intervention (outreach, recovery plan, ticket follow-up) is the
   logical next step that hasn't happened

A Critical-band customer with old issues and no recent activity → Monitor, not Stabilize.

## "Escalate" — executive attention required.

Predict Escalate when:
- Multiple unresolved Critical tickets compound, OR
- The customer has explicitly requested executive attention, OR
- A service-recovery attempt has already failed and the situation is degrading, OR
- Revenue at risk is large AND signals are actively worsening

# Important calibration notes

- The customer record's `last_review_decision` is a STRONG anchor. Reviewers
  usually maintain the previous decision unless something specific has changed
  since then. If `last_review_decision = "Monitor"`, lean Monitor unless you
  see a fresh incident in the last 30 days.
- Static fields like `next_best_action = "Executive escalation"` and
  `churn_risk_reason = "critical support or high risk score"` are PRE-COMPUTED
  defaults from the data pipeline, not specific recent signals. Don't treat
  them as evidence of a fresh issue.
- Late-delivery rate being high is HISTORIC unless you also see recent
  fulfillment events (last 30 days). Long-standing late-delivery patterns
  alone do not warrant a Stabilize.

# Output

Cite specific record IDs (order_id, ticket_id, note_id, email_id) you actually
used. Don't invent IDs. Don't pad citations.

STRICT JSON only, no commentary:
{
  "predicted_decision": "Monitor" | "Stabilize" | "Escalate",
  "predicted_band": "Critical" | "High" | "Moderate" | "Low",
  "rationale": "1-2 sentences. Reference the specific signal that drove the decision.",
  "cited_record_ids": ["T1234", "N5678", ...]
}
"""


# Fields that leak the answer (derived by the same pipeline that produced the
# ground-truth label). Stripped from the bundle so Nelson has to reason from
# raw evidence.
_LEAKY_FIELDS = {
    "risk_score",
    "risk_band",
    "health_score",
    "lifecycle_stage",
    "churn_risk_reason",
    "next_best_action",
    "last_review_decision",
    "data_quality_flags",
}


def _bundle(tenant_id: str, customer_id: str, exclude_review_id: str | None = None) -> dict:
    """Pull a customer's RAW evidence bundle for prediction.

    Excludes pre-computed risk/decision fields so Nelson must reason from
    notes, emails, orders, tickets, and events. Optionally excludes one
    review_id from the prior-reviews context (the one we're holding out).
    """
    c = AccountsRepo.get_by_id(tenant_id, customer_id)
    if not c:
        return {}
    cust = c.model_dump(mode="json")
    for f in _LEAKY_FIELDS:
        cust.pop(f, None)

    # Include prior reviews for temporal context, MINUS the held-out review.
    prior = []
    for r in ReviewsRepo.recent(tenant_id, customer_id, 5):
        if exclude_review_id and r.review_id == exclude_review_id:
            continue
        prior.append({
            "reviewed_at": str(r.reviewed_at) if r.reviewed_at else None,
            "scenario": r.scenario,
            "topic": r.topic,
            "human_decision": r.human_decision,
            "review_notes": r.review_notes,
        })

    return {
        "customer": cust,
        "prior_reviews": prior,
        "recent_orders": [o.model_dump(mode="json") for o in OrdersRepo.recent(tenant_id, customer_id, 5)],
        "recent_tickets": [t.model_dump(mode="json") for t in TicketsRepo.recent(tenant_id, customer_id, 5)],
        "recent_notes": [n.model_dump(mode="json") for n in NotesRepo.recent(tenant_id, customer_id, 5)],
        "recent_emails": [e.model_dump(mode="json") for e in EmailsRepo.recent(tenant_id, customer_id, 5)],
        "fulfillment_events": [f.model_dump(mode="json") for f in EventsRepo.fulfillment(tenant_id, customer_id, 5)],
    }


def _holdout(tenant_id: str, n: int, seed: int) -> list[dict]:
    """Stratified random sample by human_decision.

    Joins with review_outcomes so each holdout row carries the actual outcome
    (follow_up_required, outcome_status). Used for outcome-alignment scoring —
    when Nelson disagrees with the human, did reality vindicate him?
    """
    con = get_connection()
    rows = con.execute(
        """
        SELECT
            r.customer_id, r.customer_full_name, r.human_decision,
            r.scenario, r.topic, r.review_id,
            o.outcome_status, o.follow_up_required, o.outcome_type
        FROM customer_review_logs r
        LEFT JOIN review_outcomes o ON o.review_id = r.review_id
        WHERE r.tenant_id = ? AND r.human_decision IS NOT NULL
        """,
        (tenant_id,),
    ).fetchall()
    by_decision: dict[str, list[dict]] = {}
    for r in rows:
        by_decision.setdefault(r[2], []).append(
            {
                "customer_id": r[0],
                "customer_full_name": r[1],
                "human_decision": r[2],
                "scenario": r[3],
                "topic": r[4],
                "review_id": r[5],
                "outcome_status": r[6],
                "follow_up_required": bool(r[7]) if r[7] is not None else None,
                "outcome_type": r[8],
            }
        )
    if not by_decision:
        return []
    rng = random.Random(seed)
    per_class = max(2, n // len(by_decision))
    sampled: list[dict] = []
    for items in by_decision.values():
        sampled.extend(rng.sample(items, min(per_class, len(items))))
    rng.shuffle(sampled)
    return sampled[:n]


def _predict(client: genai.Client, bundle: dict) -> dict:
    user = "Customer bundle:\n" + json.dumps(bundle, default=str, indent=2)
    response = client.models.generate_content(
        model=settings.gemini_model,
        contents=[user],
        config=types.GenerateContentConfig(
            system_instruction=PREDICT_SYSTEM,
            temperature=0.1,
            response_mime_type="application/json",
        ),
    )
    raw = (response.text or "").strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"_parse_error": True, "_raw": raw[:500]}


def _valid_record_ids(bundle: dict) -> set[str]:
    valid: set[str] = set()
    for o in bundle.get("recent_orders", []):
        if o.get("order_id"):
            valid.add(o["order_id"])
    for t in bundle.get("recent_tickets", []):
        if t.get("ticket_id"):
            valid.add(t["ticket_id"])
    for n in bundle.get("recent_notes", []):
        if n.get("note_id"):
            valid.add(n["note_id"])
    for e in bundle.get("recent_emails", []):
        if e.get("email_id"):
            valid.add(e["email_id"])
    for f in bundle.get("fulfillment_events", []):
        if f.get("fulfillment_event_id"):
            valid.add(f["fulfillment_event_id"])
    return valid


_ACTION_LEVEL = {"monitor": 1, "stabilize": 2, "escalate": 3}


def _score_one(pred: dict, gt: dict, bundle: dict) -> dict:
    pred_dec = (pred.get("predicted_decision") or "").strip()
    actual = (gt.get("human_decision") or "").strip()
    cited = pred.get("cited_record_ids") or []
    valid_ids = _valid_record_ids(bundle)
    valid_citations = sum(1 for c in cited if c in valid_ids)
    follow_up = gt.get("follow_up_required")

    # Nelson recommended a more active decision than the human.
    pred_level = _ACTION_LEVEL.get(pred_dec.lower(), 0)
    actual_level = _ACTION_LEVEL.get(actual.lower(), 0)
    nelson_more_active = pred_level > actual_level
    nelson_less_active = pred_level < actual_level

    # Outcome verdict — did reality favor Nelson or the human?
    #   - If Nelson more active AND follow-up was required: Nelson vindicated
    #     (the human under-acted, the customer needed intervention).
    #   - If Nelson more active AND follow-up was NOT required: human right
    #     (Nelson would have over-intervened on a case that resolved fine).
    #   - If Nelson agreed with human: aligned (no disagreement to score).
    #   - If Nelson less active AND follow-up required: Nelson under-called
    #     (rare, but flag if it happens).
    if pred_dec.lower() == actual.lower():
        outcome_verdict = "agreed"
    elif follow_up is None:
        outcome_verdict = "no_outcome_data"
    elif nelson_more_active and follow_up:
        outcome_verdict = "nelson_vindicated"
    elif nelson_more_active and not follow_up:
        outcome_verdict = "human_right_nelson_over"
    elif nelson_less_active and follow_up:
        outcome_verdict = "nelson_under_called"
    else:
        outcome_verdict = "human_right_nelson_under"

    return {
        "decision_match": pred_dec.lower() == actual.lower() and bool(pred_dec),
        "predicted_decision": pred_dec,
        "actual_decision": actual,
        "predicted_band": pred.get("predicted_band", ""),
        "rationale": (pred.get("rationale") or "").strip(),
        "cited_count": len(cited),
        "valid_citations": valid_citations,
        "citation_validity": valid_citations / len(cited) if cited else 1.0,
        "parse_error": pred.get("_parse_error", False),
        "follow_up_required": follow_up,
        "outcome_status": gt.get("outcome_status"),
        "outcome_verdict": outcome_verdict,
        "nelson_more_active": nelson_more_active,
        "nelson_less_active": nelson_less_active,
    }


def _confusion(results: list[dict]) -> tuple[list[str], dict[str, dict[str, int]]]:
    decisions = sorted(
        {r["actual_decision"] for r in results if r["actual_decision"]}
        | {r["predicted_decision"] for r in results if r["predicted_decision"]}
    )
    matrix = {a: {p: 0 for p in decisions} for a in decisions}
    for r in results:
        a, p = r["actual_decision"], r["predicted_decision"]
        if a in matrix and p in matrix.get(a, {}):
            matrix[a][p] += 1
    return decisions, matrix


def _write_report(results: list[dict], meta: dict, timestamp: str) -> Path:
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    md_path = REPORTS_DIR / f"eval_{timestamp}.md"
    json_path = REPORTS_DIR / f"eval_{timestamp}.json"

    n = len(results)
    correct = sum(1 for r in results if r["decision_match"])
    parse_errors = sum(1 for r in results if r["parse_error"])
    avg_cites = sum(r["cited_count"] for r in results) / max(n, 1)
    avg_validity = sum(r["citation_validity"] for r in results) / max(n, 1)
    decisions, matrix = _confusion(results)

    md = []
    md.append(f"# Nelson Eval Report — {meta['timestamp_iso']}\n")
    md.append(f"- **Tenant**: `{meta['tenant_id']}`")
    md.append(f"- **Model**: `{meta['model']}`")
    md.append(f"- **Holdout size**: {n} customers")
    md.append(f"- **Random seed**: {meta['seed']}\n")

    # Outcome-alignment metrics
    disagreements = [r for r in results if not r["decision_match"]]
    nelson_vindicated = sum(1 for r in results if r["outcome_verdict"] == "nelson_vindicated")
    human_right_nelson_over = sum(1 for r in results if r["outcome_verdict"] == "human_right_nelson_over")
    nelson_under_called = sum(1 for r in results if r["outcome_verdict"] == "nelson_under_called")
    no_outcome = sum(1 for r in results if r["outcome_verdict"] == "no_outcome_data")
    scorable_disagreements = len(disagreements) - no_outcome
    nelson_outcome_aligned = correct + nelson_vindicated  # agreed + vindicated by reality
    outcome_alignment_rate = nelson_outcome_aligned / max(n, 1)

    md.append("## Headline metrics\n")
    md.append("| Metric | Value |")
    md.append("|---|---:|")
    md.append(f"| **Decision agreement** (matches human label) | {correct}/{n} = **{(correct/max(n,1)):.0%}** |")
    md.append(
        f"| **Outcome alignment** (agreed OR vindicated by `follow_up_required`) "
        f"| {nelson_outcome_aligned}/{n} = **{outcome_alignment_rate:.0%}** |"
    )
    md.append(f"| Avg citations per prediction | {avg_cites:.1f} |")
    md.append(f"| Citation validity (real IDs / total cited) | {avg_validity:.0%} |")
    md.append(f"| Parse errors | {parse_errors} |\n")

    md.append("## Disagreement analysis\n")
    md.append(
        "When Nelson and the human disagreed, did reality vindicate Nelson? "
        "Reality is `review_outcomes.follow_up_required`: if True, the customer "
        "needed intervention after the review.\n"
    )
    md.append("| Verdict | Count | Meaning |")
    md.append("|---|---:|---|")
    md.append(
        f"| **Nelson vindicated** | {nelson_vindicated} | Nelson recommended more "
        f"action, follow-up was needed (human under-acted) |"
    )
    md.append(
        f"| Human right, Nelson over-eager | {human_right_nelson_over} | Nelson "
        f"recommended more action, no follow-up needed |"
    )
    md.append(
        f"| Nelson under-called | {nelson_under_called} | Nelson recommended "
        f"less action, follow-up was needed (rare) |"
    )
    md.append(f"| No outcome data | {no_outcome} | Outcome row missing/pending |\n")

    md.append("## Confusion matrix\n")
    md.append("Rows = ground truth (`human_decision`). Columns = Nelson's prediction.\n")
    if decisions:
        md.append("| | " + " | ".join(decisions) + " |")
        md.append("|---|" + "|".join("---:" for _ in decisions) + "|")
        for a in decisions:
            md.append(f"| **{a}** | " + " | ".join(str(matrix[a][p]) for p in decisions) + " |")
    md.append("")

    md.append("## Agreement by decision class\n")
    md.append("| Class | n | Correct | Agreement |")
    md.append("|---|---:|---:|---:|")
    for d in decisions:
        in_class = [r for r in results if r["actual_decision"] == d]
        c = sum(1 for r in in_class if r["decision_match"])
        rate = (c / len(in_class)) if in_class else 0.0
        md.append(f"| {d} | {len(in_class)} | {c} | {rate:.0%} |")
    md.append("")

    md.append("## Per-customer detail\n")
    md.append("| Customer | Actual | Predicted | Match | Verdict | Follow-up? | Cites | Rationale |")
    md.append("|---|---|---|:-:|---|:-:|---:|---|")
    for r in results:
        mark = "✓" if r["decision_match"] else "✗"
        rat = r["rationale"][:80].replace("\n", " ").replace("|", "\\|")
        verdict_short = {
            "agreed": "—",
            "nelson_vindicated": "🎯 Nelson",
            "human_right_nelson_over": "Human",
            "nelson_under_called": "⚠️ under",
            "human_right_nelson_under": "Human",
            "no_outcome_data": "?",
        }.get(r["outcome_verdict"], "?")
        fu = (
            "yes" if r["follow_up_required"] is True
            else "no" if r["follow_up_required"] is False
            else "?"
        )
        md.append(
            f"| {r['customer_full_name']} | {r['actual_decision']} | "
            f"{r['predicted_decision'] or '—'} | {mark} | {verdict_short} | "
            f"{fu} | {r['cited_count']} | {rat} |"
        )

    md_path.write_text("\n".join(md), encoding="utf-8")
    json_path.write_text(
        json.dumps({"meta": meta, "results": results}, indent=2, default=str),
        encoding="utf-8",
    )
    return md_path


def run(limit: int = 30, seed: int = 42, tenant_id: str | None = None) -> int:
    tenant_id = tenant_id or settings.default_tenant_id
    if not settings.gemini_api_key:
        print("  [eval] GEMINI_API_KEY not set in .env", file=sys.stderr)
        return 1

    holdout = _holdout(tenant_id, limit, seed)
    if not holdout:
        print("  [eval] no review records to evaluate against", file=sys.stderr)
        return 1

    print(f"  [eval] holdout: {len(holdout)} customers (seed={seed})")
    print(f"  [eval] model: {settings.gemini_model}")
    print(f"  [eval] bundle: raw evidence only — pre-computed risk/decision fields stripped")
    print(f"  [eval] running predictions...")

    client = genai.Client(api_key=settings.gemini_api_key)
    results: list[dict] = []
    for i, gt in enumerate(holdout, 1):
        cid = gt["customer_id"]
        name = gt["customer_full_name"]
        bundle = _bundle(tenant_id, cid, exclude_review_id=gt.get("review_id"))
        if not bundle:
            print(f"  [eval] {i}/{len(holdout)}  {name}  [skip: no bundle]")
            continue
        try:
            pred = _predict(client, bundle)
        except Exception as e:
            pred = {"_parse_error": True, "_error": f"{type(e).__name__}: {e}"}
        scored = _score_one(pred, gt, bundle)
        scored["customer_full_name"] = name
        scored["customer_id"] = cid
        scored["review_id"] = gt["review_id"]
        results.append(scored)
        mark = "OK" if scored["decision_match"] else "  "
        print(
            f"  [eval] {i}/{len(holdout)}  [{mark}] "
            f"{name:<28} actual={scored['actual_decision']:<10} "
            f"pred={scored['predicted_decision'] or '—':<10}"
        )

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    meta = {
        "timestamp_iso": datetime.utcnow().isoformat() + "Z",
        "tenant_id": tenant_id,
        "model": settings.gemini_model,
        "seed": seed,
        "holdout_size": len(results),
    }
    report = _write_report(results, meta, timestamp)
    correct = sum(1 for r in results if r["decision_match"])
    print(
        f"\n  [eval] done. agreement={correct}/{len(results)} "
        f"({correct/max(len(results),1):.0%})"
    )
    print(f"  [eval] report -> {report.relative_to(ROOT)}")
    return 0
