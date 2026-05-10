"""Repair customer_2000 dataset.

Applies five fixes to make the data internally coherent before Nelson reads it:

  A. Date rebase     — single timeline anchored at 2026-05-09 ("today")
  B. Ticket columns  — drop broken timestamp columns; keep durations
  C. Email lineage   — backfill source_signal_ids on emails from notes
  D. Volume curve    — sample notes/emails so high-risk customers have more touches
  E. Ticket spread   — redistribute tickets so support pressure correlates with risk

Originals are overwritten in place. A `.bak/` snapshot is created the first time
the script runs. Re-running is idempotent against the snapshot.

Outputs:
  - data/customer_2000/*.csv (repaired, in place)
  - data/customer_2000/.bak/*.csv (originals, created once)
  - data/REPAIR_LOG.md (what changed)
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "customer_2000"
BAK = DATA / ".bak"
LOG = ROOT / "data" / "REPAIR_LOG.md"

TODAY = pd.Timestamp("2026-05-09")
RNG = np.random.default_rng(seed=42)


def snapshot_originals() -> None:
    """One-shot copy of the original CSVs. Subsequent runs read from here."""
    if BAK.exists():
        return
    BAK.mkdir(parents=True, exist_ok=True)
    for csv in DATA.glob("*.csv"):
        shutil.copy2(csv, BAK / csv.name)
    print(f"  [snapshot] {len(list(BAK.glob('*.csv')))} originals -> {BAK.relative_to(ROOT)}")


def load(name: str) -> pd.DataFrame:
    """Always load from the snapshot so the script is idempotent."""
    return pd.read_csv(BAK / f"{name}.csv", low_memory=False)


def save(df: pd.DataFrame, name: str) -> None:
    df.to_csv(DATA / f"{name}.csv", index=False)


# ---------------- A. Date rebase ----------------

def repair_dates(
    orders: pd.DataFrame,
    fulfillment: pd.DataFrame,
    tickets: pd.DataFrame,
    outcomes: pd.DataFrame,
    reviews: pd.DataFrame,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Anchor every timestamp to a coherent timeline ending at TODAY."""
    notes_log: list[str] = []

    # Orders + fulfillment_events share a date range (2015-01-01 to 2017-10-02).
    # Shift so most recent order = TODAY - 30 days.
    orders["order_date"] = pd.to_datetime(orders["order_date"], errors="coerce")
    orders["shipping_date"] = pd.to_datetime(orders["shipping_date"], errors="coerce")
    fulfillment["event_date"] = pd.to_datetime(fulfillment["event_date"], errors="coerce")
    target_max = TODAY - pd.Timedelta(days=30)
    delta_orders = target_max - orders["order_date"].max()
    orders["order_date"] = orders["order_date"] + delta_orders
    orders["shipping_date"] = orders["shipping_date"] + delta_orders
    fulfillment["event_date"] = fulfillment["event_date"] + delta_orders
    notes_log.append(f"Orders + fulfillment shifted by **{delta_orders.days} days**.")

    # Support tickets: date_of_purchase 2020-01-01 to 2021-12-30.
    # Shift so max → TODAY - 7 days.
    tickets["date_of_purchase"] = pd.to_datetime(tickets["date_of_purchase"], errors="coerce")
    delta_tickets = (TODAY - pd.Timedelta(days=7)) - tickets["date_of_purchase"].max()
    tickets["date_of_purchase"] = tickets["date_of_purchase"] + delta_tickets
    notes_log.append(f"Support tickets shifted by **{delta_tickets.days} days**.")

    # review_outcomes: every row is dated 2026-05-12 (future). Split:
    #   80% → uniform random between (review.reviewed_at + 1 day) and TODAY - 1 day
    #   20% → NULL outcome_date and outcome_status="Pending" (real "follow up needed")
    outcomes["outcome_date"] = pd.to_datetime(outcomes["outcome_date"], errors="coerce")
    reviews_lookup = reviews.set_index("review_id")["reviewed_at"]
    reviews_lookup = pd.to_datetime(reviews_lookup, errors="coerce")

    n = len(outcomes)
    is_pending = RNG.random(n) < 0.20
    new_dates = []
    for i, (_, row) in enumerate(outcomes.iterrows()):
        if is_pending[i]:
            new_dates.append(pd.NaT)
            continue
        rev_date = reviews_lookup.get(row["review_id"], pd.NaT)
        if pd.isna(rev_date):
            new_dates.append(pd.NaT)
            continue
        low = rev_date + pd.Timedelta(days=1)
        high = TODAY - pd.Timedelta(days=1)
        if low >= high:
            new_dates.append(low)
        else:
            span = (high - low).days
            offset = RNG.integers(0, span + 1)
            new_dates.append(low + pd.Timedelta(days=int(offset)))
    outcomes["outcome_date"] = new_dates
    outcomes.loc[is_pending, "outcome_status"] = "Pending"
    outcomes.loc[is_pending, "follow_up_required"] = True
    pending_count = int(is_pending.sum())
    completed_count = n - pending_count
    notes_log.append(
        f"review_outcomes: **{completed_count} completed** (rebased into past), "
        f"**{pending_count} pending** (NULL date, follow-up required)."
    )

    return orders, fulfillment, tickets, outcomes, notes_log


# ---------------- B. Ticket columns ----------------

def repair_ticket_columns(tickets: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    """Drop the two broken timestamp columns. Keep `resolution_time_hours`."""
    notes_log: list[str] = []
    drop = [c for c in ("first_response_time", "time_to_resolution") if c in tickets.columns]
    if drop:
        tickets = tickets.drop(columns=drop)
        notes_log.append(f"Dropped broken timestamp columns: {drop}.")
    return tickets, notes_log


# ---------------- C. Email lineage ----------------

def repair_email_lineage(
    emails: pd.DataFrame, notes: pd.DataFrame
) -> tuple[pd.DataFrame, list[str]]:
    """Backfill source_signal_ids on emails by matching (customer, scenario, topic) to notes."""
    notes_log: list[str] = []
    note_refs = (
        notes.dropna(subset=["source_signal_ids"])
        .groupby(["customer_id", "scenario", "topic"])["source_signal_ids"]
        .agg(lambda s: ";".join(sorted({r for cell in s for r in str(cell).split(";") if r})))
        .reset_index()
        .rename(columns={"source_signal_ids": "_refs"})
    )
    merged = emails.merge(note_refs, on=["customer_id", "scenario", "topic"], how="left")
    before = emails["source_signal_ids"].fillna("").astype(str).str.strip().eq("").sum()
    merged["source_signal_ids"] = merged["_refs"].fillna("")
    after = merged["source_signal_ids"].fillna("").astype(str).str.strip().eq("").sum()
    merged = merged.drop(columns=["_refs"])
    notes_log.append(
        f"Emails with refs: was {len(emails) - before:,}, now {len(merged) - after:,} "
        f"({(len(merged) - after) / len(merged):.0%}). "
        f"{after:,} remain empty (no matching note scenario)."
    )
    return merged, notes_log


# ---------------- D. Volume curve ----------------

def _target_count(risk_band: str, low: int, high: int) -> int:
    """Map risk band → (target_low, target_high) sample count."""
    band = (risk_band or "").lower()
    if "critical" in band or "high" in band:
        return RNG.integers(int(0.7 * high), high + 1)
    if "elevated" in band or "moderate" in band:
        return RNG.integers(low + (high - low) // 3, low + 2 * (high - low) // 3 + 1)
    return RNG.integers(low, low + max(1, (high - low) // 3) + 1)


def diversify_volume(
    customers: pd.DataFrame, table: pd.DataFrame, low: int, high: int, name: str
) -> tuple[pd.DataFrame, list[str]]:
    """Sample down rows per customer so volume tracks risk_band."""
    notes_log: list[str] = []
    band_lookup = customers.set_index("customer_id")["risk_band"].to_dict()
    keep_rows: list[pd.DataFrame] = []
    for cid, group in table.groupby("customer_id", sort=False):
        target = _target_count(band_lookup.get(cid, ""), low, high)
        if len(group) <= target:
            keep_rows.append(group)
        else:
            keep_rows.append(group.sample(n=int(target), random_state=int(cid[-3:] or 0) if cid[-3:].isdigit() else 0))
    repaired = pd.concat(keep_rows, ignore_index=True)
    notes_log.append(
        f"{name}: {len(table):,} → {len(repaired):,} rows. "
        f"Volume now correlates with risk_band (low={low}-{low + (high-low)//3}, "
        f"mid={low + (high-low)//3}-{low + 2*(high-low)//3}, high={int(0.7*high)}-{high})."
    )
    return repaired, notes_log


# ---------------- E. Ticket spread ----------------

def spread_tickets(
    customers: pd.DataFrame, tickets: pd.DataFrame, bridge: pd.DataFrame
) -> tuple[pd.DataFrame, pd.DataFrame, list[str]]:
    """Redistribute tickets so support pressure tracks risk_score.

    Customers are sorted by risk_score desc; tickets sorted by priority desc.
    Top customers get more tickets, healthiest get zero.
    """
    notes_log: list[str] = []
    n_tickets = len(tickets)

    cust_sorted = customers.sort_values("risk_score", ascending=False).reset_index(drop=True)

    # Target counts per band
    counts = []
    for _, row in cust_sorted.iterrows():
        band = str(row.get("risk_band", "")).lower()
        if "critical" in band:
            counts.append(int(RNG.integers(4, 7)))    # 4-6
        elif "high" in band:
            counts.append(int(RNG.integers(2, 5)))    # 2-4
        elif "elevated" in band or "moderate" in band:
            counts.append(int(RNG.integers(1, 3)))    # 1-2
        else:
            counts.append(int(RNG.choice([0, 0, 0, 1], p=[0.4, 0.3, 0.2, 0.1])))  # mostly 0

    # Scale to match available tickets
    total = sum(counts)
    scale = n_tickets / max(total, 1)
    counts = [max(0, int(round(c * scale))) for c in counts]
    # Trim to exact n_tickets
    diff = sum(counts) - n_tickets
    i = 0
    while diff != 0 and i < len(counts) * 3:
        idx = RNG.integers(0, len(counts))
        if diff > 0 and counts[idx] > 0:
            counts[idx] -= 1
            diff -= 1
        elif diff < 0:
            counts[idx] += 1
            diff += 1
        i += 1

    # Sort tickets by priority/severity so high-priority go to high-risk
    priority_order = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}
    tickets_sorted = tickets.copy()
    tickets_sorted["_pri"] = tickets_sorted.get("ticket_priority", "Medium").map(
        lambda x: priority_order.get(str(x), 2)
    )
    tickets_sorted = tickets_sorted.sort_values("_pri").drop(columns=["_pri"]).reset_index(drop=True)

    # Assign
    name_lookup = customers.set_index("customer_id")["customer_full_name"].to_dict()
    src_lookup = customers.set_index("customer_id")["source_customer_id"].to_dict()
    new_assignments: list[dict] = []
    cursor = 0
    for cust_idx, n in enumerate(counts):
        cid = cust_sorted.iloc[cust_idx]["customer_id"]
        for _ in range(n):
            if cursor >= len(tickets_sorted):
                break
            row = tickets_sorted.iloc[cursor].to_dict()
            row["customer_id"] = cid
            row["source_customer_id"] = src_lookup.get(cid, "")
            row["customer_full_name"] = name_lookup.get(cid, "")
            new_assignments.append(row)
            cursor += 1

    new_tickets = pd.DataFrame(new_assignments)

    # Update bridge to match
    new_bridge = new_tickets[["ticket_id", "customer_id", "customer_full_name"]].copy()
    new_bridge["source_ticket_id"] = new_bridge["ticket_id"].str.replace("T", "").astype(int, errors="ignore")
    new_bridge["mapping_method"] = "risk_redistribution_v2"
    new_bridge["mapping_confidence"] = 1.0
    new_bridge["mapping_note"] = "Reassigned by repair_data.py to track risk_score."
    new_bridge["source_customer_id"] = new_bridge["customer_id"].map(src_lookup)
    new_bridge = new_bridge[
        [
            "source_ticket_id", "ticket_id", "customer_id", "source_customer_id",
            "customer_full_name", "mapping_method", "mapping_confidence", "mapping_note",
        ]
    ]
    # Re-add columns from original bridge that we may have dropped
    for col in bridge.columns:
        if col not in new_bridge.columns:
            new_bridge[col] = ""
    new_bridge = new_bridge[bridge.columns]

    distribution = pd.Series(counts).value_counts().sort_index()
    notes_log.append(
        f"Tickets redistributed across customers. Distribution (tickets per customer): "
        f"{dict(distribution)}. "
        f"{(pd.Series(counts) == 0).sum():,} customers now have **zero tickets** (healthy)."
    )

    return new_tickets, new_bridge, notes_log


# ---------------- main ----------------

def main() -> int:
    if not DATA.exists():
        print(f"Missing {DATA}", file=sys.stderr)
        return 1

    snapshot_originals()
    log: list[str] = []

    # Load all originals from snapshot
    customers = load("customers")
    orders = load("orders")
    order_lines = load("order_lines")
    tickets = load("support_tickets")
    notes = load("customer_notes")
    emails = load("customer_email_logs")
    reviews = load("customer_review_logs")
    outcomes = load("review_outcomes")
    engagement = load("engagement_events")
    fulfillment = load("fulfillment_events")
    bridge = load("customer_support_bridge")

    log.append("# Repair log\n")
    log.append(f"_Anchor: TODAY = {TODAY.date()}._\n")

    # A. Dates
    log.append("\n## A. Date rebase\n")
    orders, fulfillment, tickets, outcomes, a_notes = repair_dates(
        orders, fulfillment, tickets, outcomes, reviews
    )
    log.extend(f"- {n}" for n in a_notes)

    # B. Ticket columns
    log.append("\n## B. Ticket columns\n")
    tickets, b_notes = repair_ticket_columns(tickets)
    log.extend(f"- {n}" for n in b_notes)

    # C. Email lineage
    log.append("\n## C. Email lineage\n")
    emails, c_notes = repair_email_lineage(emails, notes)
    log.extend(f"- {n}" for n in c_notes)

    # D. Volume curve
    log.append("\n## D. Volume diversification\n")
    notes, d1 = diversify_volume(customers, notes, low=1, high=12, name="customer_notes")
    emails, d2 = diversify_volume(customers, emails, low=2, high=20, name="customer_email_logs")
    log.extend(f"- {n}" for n in d1 + d2)

    # E. Ticket spread
    log.append("\n## E. Ticket spread\n")
    tickets, bridge, e_notes = spread_tickets(customers, tickets, bridge)
    log.extend(f"- {n}" for n in e_notes)

    # Save everything
    save(customers, "customers")
    save(orders, "orders")
    save(order_lines, "order_lines")
    save(tickets, "support_tickets")
    save(notes, "customer_notes")
    save(emails, "customer_email_logs")
    save(reviews, "customer_review_logs")
    save(outcomes, "review_outcomes")
    save(engagement, "engagement_events")
    save(fulfillment, "fulfillment_events")
    save(bridge, "customer_support_bridge")

    LOG.write_text("\n".join(log), encoding="utf-8")
    print(f"  [done] log -> {LOG.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
