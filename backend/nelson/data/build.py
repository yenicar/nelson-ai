"""Build `nelson.duckdb` from the customer_2000 CSVs.

- Drops + recreates every spine table from CSV (via DuckDB's read_csv_auto —
  no pandas required at runtime).
- Adds `tenant_id` to every spine table (default tenant).
- Creates indexes on hot keys (customer_id, tenant_id).
- Creates runtime tables (pending_actions, sessions, messages, decisions) only
  if they don't exist — preserving any human work between rebuilds.
- Validates expected columns are present; fails loud on schema drift.

Usage:
    python -m nelson.cli build-data
"""
from __future__ import annotations

import sys

import duckdb

from nelson.config.settings import settings
from nelson.data.db import close_connection, get_connection

# (table_name, csv_filename) — must match the CSVs in customer_data_dir
SPINE_TABLES: list[tuple[str, str]] = [
    ("customers", "customers"),
    ("customer_bridge", "customer_bridge"),
    ("customer_contacts", "customer_contacts"),
    ("customer_adjustments", "customer_adjustments"),
    ("customer_email_logs", "customer_email_logs"),
    ("customer_notes", "customer_notes"),
    ("customer_review_logs", "customer_review_logs"),
    ("customer_support_bridge", "customer_support_bridge"),
    ("engagement_events", "engagement_events"),
    ("fulfillment_events", "fulfillment_events"),
    ("order_lines", "order_lines"),
    ("orders", "orders"),
    ("review_outcomes", "review_outcomes"),
    ("support_tickets", "support_tickets"),
]

REQUIRED_COLUMNS: dict[str, set[str]] = {
    "customers": {"customer_id", "customer_full_name", "risk_band", "lifecycle_stage"},
    "orders": {"order_id", "customer_id", "order_date", "delivery_status"},
    "support_tickets": {"ticket_id", "customer_id", "ticket_priority"},
    "customer_notes": {"note_id", "customer_id", "note_text", "scenario"},
    "customer_email_logs": {"email_id", "customer_id", "body", "scenario"},
    "customer_review_logs": {"review_id", "customer_id", "human_decision"},
    "review_outcomes": {"outcome_id", "review_id", "outcome_status"},
    "engagement_events": {"engagement_id", "customer_id", "engagement_score"},
    "fulfillment_events": {"fulfillment_event_id", "customer_id", "severity"},
}


def _validate_columns(con: duckdb.DuckDBPyConnection, table: str, csv_path: str) -> None:
    expected = REQUIRED_COLUMNS.get(table)
    if not expected:
        return
    # DESCRIBE on a SELECT against read_csv_auto returns column metadata.
    rows = con.execute(
        f"DESCRIBE SELECT * FROM read_csv_auto(?, HEADER=TRUE)",
        (csv_path,),
    ).fetchall()
    cols = {r[0] for r in rows}
    missing = expected - cols
    if missing:
        raise RuntimeError(
            f"Schema drift in {table}.csv — missing required columns: {sorted(missing)}"
        )


def _index(con: duckdb.DuckDBPyConnection, table: str, columns: list[str]) -> None:
    cols = [c for c in columns if _has_column(con, table, c)]
    for col in cols:
        con.execute(f"CREATE INDEX IF NOT EXISTS idx_{table}_{col} ON {table}({col})")


def _has_column(con: duckdb.DuckDBPyConnection, table: str, col: str) -> bool:
    rows = con.execute(
        f"SELECT 1 FROM information_schema.columns "
        f"WHERE table_name='{table}' AND column_name='{col}' LIMIT 1"
    ).fetchall()
    return bool(rows)


def _create_runtime_tables(con: duckdb.DuckDBPyConnection) -> None:
    """Tables Nelson writes to. Created once, preserved across rebuilds."""
    con.execute("""
        CREATE TABLE IF NOT EXISTS pending_actions (
            action_id           VARCHAR PRIMARY KEY,
            tenant_id           VARCHAR NOT NULL,
            customer_id         VARCHAR NOT NULL,
            customer_full_name  VARCHAR,
            action_type         VARCHAR NOT NULL,
            payload_json        VARCHAR NOT NULL,
            status              VARCHAR DEFAULT 'pending',
            created_at          TIMESTAMP NOT NULL,
            decided_at          TIMESTAMP,
            decided_by          VARCHAR,
            nelson_rationale    VARCHAR,
            confidence          DOUBLE,
            sent_at             TIMESTAMP,
            send_error          VARCHAR
        )
    """)
    # Migration: add columns to existing tables that pre-date the send-tracking feature.
    for col, ddl in [
        ("sent_at", "ALTER TABLE pending_actions ADD COLUMN sent_at TIMESTAMP"),
        ("send_error", "ALTER TABLE pending_actions ADD COLUMN send_error VARCHAR"),
    ]:
        try:
            con.execute(ddl)
            print(f"  [build] migrated: pending_actions.{col} added")
        except Exception:
            pass  # column already exists
    con.execute("""
        CREATE TABLE IF NOT EXISTS nelson_sessions (
            session_id     VARCHAR PRIMARY KEY,
            tenant_id      VARCHAR NOT NULL,
            user_id        VARCHAR NOT NULL,
            surface        VARCHAR NOT NULL,
            started_at     TIMESTAMP NOT NULL,
            last_active_at TIMESTAMP NOT NULL
        )
    """)
    con.execute("""
        CREATE TABLE IF NOT EXISTS nelson_messages (
            message_id      VARCHAR PRIMARY KEY,
            session_id      VARCHAR NOT NULL,
            role            VARCHAR NOT NULL,
            content         VARCHAR NOT NULL,
            tool_calls_json VARCHAR,
            created_at      TIMESTAMP NOT NULL
        )
    """)
    con.execute("""
        CREATE TABLE IF NOT EXISTS human_decisions (
            decision_id        VARCHAR PRIMARY KEY,
            tenant_id          VARCHAR NOT NULL,
            customer_id        VARCHAR NOT NULL,
            customer_full_name VARCHAR,
            decision           VARCHAR NOT NULL,
            decided_by         VARCHAR NOT NULL,
            decided_at         TIMESTAMP NOT NULL,
            decision_notes     VARCHAR,
            related_action_id  VARCHAR,
            related_review_id  VARCHAR
        )
    """)


def build() -> int:
    data_dir = settings.customer_data_dir
    if not data_dir.exists():
        print(f"  [error] missing {data_dir}", file=sys.stderr)
        return 1

    # Force a fresh DB for spine; runtime tables are CREATE IF NOT EXISTS later.
    db_path = settings.duckdb_path
    if db_path.exists():
        close_connection()
        db_path.unlink()
    con = get_connection()
    tenant = settings.default_tenant_id

    print(f"  [build] target: {db_path}")
    print(f"  [build] tenant: {tenant}")

    for table, csv_name in SPINE_TABLES:
        csv = data_dir / f"{csv_name}.csv"
        if not csv.exists():
            raise RuntimeError(f"missing {csv}")
        csv_str = str(csv)
        _validate_columns(con, table, csv_str)
        # Read the CSV directly via DuckDB, append tenant_id in the SELECT.
        # SAMPLE_SIZE=-1 forces a full-file scan for type inference, matching
        # pandas' default behavior on mixed-type columns.
        con.execute(
            f"""
            CREATE OR REPLACE TABLE {table} AS
            SELECT *, ? AS tenant_id
            FROM read_csv_auto(?, HEADER=TRUE, SAMPLE_SIZE=-1)
            """,
            (tenant, csv_str),
        )
        _index(con, table, ["tenant_id", "customer_id", "ticket_id", "order_id", "review_id"])
        n = con.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        print(f"  [build] {table:<28} {n:>7,} rows")

    _create_runtime_tables(con)
    print("  [build] runtime tables ready")

    # Useful views
    con.execute("""
        CREATE OR REPLACE VIEW v_customer_recent_activity AS
        SELECT
            c.tenant_id, c.customer_id, c.customer_full_name,
            (SELECT MAX(date)         FROM customer_email_logs e WHERE e.customer_id = c.customer_id) AS last_email_at,
            (SELECT MAX(note_date)    FROM customer_notes      n WHERE n.customer_id = c.customer_id) AS last_note_at,
            (SELECT MAX(order_date)   FROM orders              o WHERE o.customer_id = c.customer_id) AS last_order_at,
            (SELECT MAX(reviewed_at)  FROM customer_review_logs r WHERE r.customer_id = c.customer_id) AS last_review_at,
            (SELECT MAX(event_date)   FROM engagement_events   eg WHERE eg.customer_id = c.customer_id) AS last_engagement_at
        FROM customers c
    """)
    con.execute("""
        CREATE OR REPLACE VIEW v_portfolio_summary AS
        SELECT tenant_id,
               COUNT(*) AS total_customers,
               SUM(CASE WHEN risk_band ILIKE '%critical%' THEN 1 ELSE 0 END) AS critical_count,
               SUM(CASE WHEN risk_band ILIKE '%high%'     THEN 1 ELSE 0 END) AS high_count,
               SUM(CASE WHEN risk_band ILIKE '%moderate%' OR risk_band ILIKE '%elevated%' THEN 1 ELSE 0 END) AS moderate_count,
               SUM(CASE WHEN risk_band ILIKE '%low%'      THEN 1 ELSE 0 END) AS low_count,
               AVG(risk_score)   AS avg_risk_score,
               AVG(health_score) AS avg_health_score,
               SUM(total_sales)  AS total_revenue,
               SUM(total_profit) AS total_profit
        FROM customers
        GROUP BY tenant_id
    """)
    print("  [build] views: v_customer_recent_activity, v_portfolio_summary")

    print(f"  [build] done -> {db_path}")
    return 0


if __name__ == "__main__":
    sys.exit(build())
