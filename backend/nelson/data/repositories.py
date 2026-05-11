"""Typed query helpers over DuckDB.

Every query is tenant-scoped. Repos return pydantic models (or lists thereof),
never raw rows. Keep methods minimal — add only what callers actually need.
"""
from __future__ import annotations

from typing import TypeVar

from pydantic import BaseModel

from nelson.data.db import get_connection
from nelson.data.schemas import (
    Customer,
    CustomerEmail,
    CustomerNote,
    CustomerReview,
    EngagementEvent,
    FulfillmentEvent,
    Order,
    PendingAction,
    ReviewOutcome,
    SupportTicket,
)

T = TypeVar("T", bound=BaseModel)


def _fetch(model: type[T], sql: str, params: list | tuple = ()) -> list[T]:
    con = get_connection()
    cur = con.execute(sql, params)
    cols = [c[0] for c in cur.description]
    rows = cur.fetchall()
    return [model(**dict(zip(cols, row, strict=False))) for row in rows]


def _fetch_one(model: type[T], sql: str, params: list | tuple = ()) -> T | None:
    rows = _fetch(model, sql, params)
    return rows[0] if rows else None


# --------------- AccountsRepo ---------------

class AccountsRepo:
    """Customer-level queries. Names are user-facing; IDs are internal."""

    @staticmethod
    def list(tenant_id: str, limit: int = 100, offset: int = 0) -> list[Customer]:
        return _fetch(
            Customer,
            "SELECT * FROM customers WHERE tenant_id=? ORDER BY risk_score DESC NULLS LAST LIMIT ? OFFSET ?",
            (tenant_id, limit, offset),
        )

    @staticmethod
    def get_by_id(tenant_id: str, customer_id: str) -> Customer | None:
        return _fetch_one(
            Customer,
            "SELECT * FROM customers WHERE tenant_id=? AND customer_id=?",
            (tenant_id, customer_id),
        )

    @staticmethod
    def get_by_name(tenant_id: str, name: str) -> Customer | None:
        """Exact case-insensitive name match. Use search() for fuzzy."""
        return _fetch_one(
            Customer,
            "SELECT * FROM customers WHERE tenant_id=? AND LOWER(customer_full_name)=LOWER(?) LIMIT 1",
            (tenant_id, name),
        )

    @staticmethod
    def search(tenant_id: str, query: str, limit: int = 10) -> list[Customer]:
        """Fuzzy LIKE search by name or email. Case-insensitive."""
        like = f"%{query.lower()}%"
        return _fetch(
            Customer,
            """
            SELECT * FROM customers
            WHERE tenant_id=?
              AND (LOWER(customer_full_name) LIKE ? OR LOWER(customer_email) LIKE ?)
            ORDER BY risk_score DESC NULLS LAST
            LIMIT ?
            """,
            (tenant_id, like, like, limit),
        )

    @staticmethod
    def top_at_risk(tenant_id: str, limit: int = 10) -> list[Customer]:
        return _fetch(
            Customer,
            """
            SELECT * FROM customers
            WHERE tenant_id=?
            ORDER BY risk_score DESC NULLS LAST
            LIMIT ?
            """,
            (tenant_id, limit),
        )

    @staticmethod
    def by_band(tenant_id: str, band: str, limit: int = 50) -> list[Customer]:
        return _fetch(
            Customer,
            "SELECT * FROM customers WHERE tenant_id=? AND risk_band ILIKE ? LIMIT ?",
            (tenant_id, f"%{band}%", limit),
        )

    @staticmethod
    def top_by_revenue(tenant_id: str, limit: int = 10, ascending: bool = False) -> list[Customer]:
        order = "ASC" if ascending else "DESC"
        return _fetch(
            Customer,
            f"""
            SELECT * FROM customers
            WHERE tenant_id=?
            ORDER BY total_sales {order} NULLS LAST
            LIMIT ?
            """,
            (tenant_id, limit),
        )

    @staticmethod
    def search_by_prefix(tenant_id: str, prefix: str, limit: int = 20) -> list[Customer]:
        """Customers whose full name starts with `prefix` (case-insensitive)."""
        return _fetch(
            Customer,
            """
            SELECT * FROM customers
            WHERE tenant_id=? AND LOWER(customer_full_name) LIKE LOWER(?)
            ORDER BY risk_score DESC NULLS LAST
            LIMIT ?
            """,
            (tenant_id, f"{prefix}%", limit),
        )

    # ---------- Sentiment (rolled up from emails + tickets) ----------
    # Classification is keyword-based on the synthesized `sentiment_hint` /
    # `customer_sentiment` labels. Buckets: positive / neutral / negative.

    _SENTIMENT_CTE = """
        WITH signals AS (
            SELECT customer_id, LOWER(COALESCE(sentiment_hint, '')) AS s
            FROM customer_email_logs
            WHERE tenant_id = ? AND sentiment_hint IS NOT NULL
            UNION ALL
            SELECT customer_id, LOWER(COALESCE(customer_sentiment, '')) AS s
            FROM support_tickets
            WHERE tenant_id = ? AND customer_sentiment IS NOT NULL
        ),
        classified AS (
            SELECT
                customer_id,
                CASE
                    WHEN s LIKE '%posit%' OR s LIKE '%happy%' OR s LIKE '%satisf%'
                         OR s LIKE '%pleas%' OR s = 'good' OR s LIKE '%stable%'
                         OR s LIKE '%resolved%' OR s LIKE '%delight%'
                        THEN 'positive'
                    WHEN s LIKE '%negat%' OR s LIKE '%concern%' OR s LIKE '%frust%'
                         OR s LIKE '%angry%' OR s LIKE '%upset%' OR s LIKE '%critical%'
                         OR s LIKE '%dissat%' OR s LIKE '%urgent%'
                        THEN 'negative'
                    ELSE 'neutral'
                END AS bucket
            FROM signals
        )
    """

    @staticmethod
    def sentiment_for_customers(tenant_id: str, customer_ids: list[str]) -> dict[str, dict]:
        """Per-customer sentiment breakdown. Returns {customer_id: {pos, neu, neg, total, net}}."""
        if not customer_ids:
            return {}
        con = get_connection()
        placeholders = ",".join(["?"] * len(customer_ids))
        rows = con.execute(
            AccountsRepo._SENTIMENT_CTE + f"""
            SELECT
                customer_id,
                SUM(CASE WHEN bucket='positive' THEN 1 ELSE 0 END) AS pos,
                SUM(CASE WHEN bucket='neutral'  THEN 1 ELSE 0 END) AS neu,
                SUM(CASE WHEN bucket='negative' THEN 1 ELSE 0 END) AS neg,
                COUNT(*)                                            AS total
            FROM classified
            WHERE customer_id IN ({placeholders})
            GROUP BY customer_id
            """,
            (tenant_id, tenant_id, *customer_ids),
        ).fetchall()
        out: dict[str, dict] = {}
        for r in rows:
            pos, neu, neg, total = int(r[1] or 0), int(r[2] or 0), int(r[3] or 0), int(r[4] or 0)
            net = round(((pos - neg) / total) * 100) if total else 0
            out[r[0]] = {"positive": pos, "neutral": neu, "negative": neg, "total": total, "net": net}
        # Fill zeros for customers with no signals so the frontend doesn't need
        # to handle missing keys.
        for cid in customer_ids:
            out.setdefault(cid, {"positive": 0, "neutral": 0, "negative": 0, "total": 0, "net": 0})
        return out

    @staticmethod
    def portfolio_sentiment(tenant_id: str) -> dict:
        """Portfolio-wide sentiment breakdown across all email + ticket signals."""
        con = get_connection()
        row = con.execute(
            AccountsRepo._SENTIMENT_CTE + """
            SELECT
                SUM(CASE WHEN bucket='positive' THEN 1 ELSE 0 END) AS pos,
                SUM(CASE WHEN bucket='neutral'  THEN 1 ELSE 0 END) AS neu,
                SUM(CASE WHEN bucket='negative' THEN 1 ELSE 0 END) AS neg,
                COUNT(*)                                            AS total
            FROM classified
            """,
            (tenant_id, tenant_id),
        ).fetchone()
        if not row:
            return {"positive": 0, "neutral": 0, "negative": 0, "total": 0, "net": 0}
        pos, neu, neg, total = int(row[0] or 0), int(row[1] or 0), int(row[2] or 0), int(row[3] or 0)
        net = round(((pos - neg) / total) * 100) if total else 0
        return {"positive": pos, "neutral": neu, "negative": neg, "total": total, "net": net}

    @staticmethod
    def portfolio_summary(tenant_id: str) -> dict:
        """Always returns a complete summary object — falls back to zeros if
        no rows match. Queries the customers table directly (no view dep)."""
        con = get_connection()
        cur = con.execute(
            """
            SELECT
                COUNT(*)                                                    AS total_customers,
                SUM(CASE WHEN risk_band ILIKE '%critical%' THEN 1 ELSE 0 END) AS critical_count,
                SUM(CASE WHEN risk_band ILIKE '%high%'     THEN 1 ELSE 0 END) AS high_count,
                SUM(CASE WHEN risk_band ILIKE '%moderate%' OR risk_band ILIKE '%elevated%' THEN 1 ELSE 0 END) AS moderate_count,
                SUM(CASE WHEN risk_band ILIKE '%low%'      THEN 1 ELSE 0 END) AS low_count,
                AVG(risk_score)                                             AS avg_risk_score,
                AVG(health_score)                                           AS avg_health_score,
                SUM(total_sales)                                            AS total_revenue,
                SUM(total_profit)                                           AS total_profit,
                SUM(CASE WHEN risk_band ILIKE '%critical%' OR risk_band ILIKE '%high%' THEN total_sales ELSE 0 END) AS revenue_at_risk
            FROM customers
            WHERE tenant_id = ?
            """,
            (tenant_id,),
        )
        cols = [c[0] for c in cur.description]
        row = cur.fetchone()
        if not row:
            row = (0, 0, 0, 0, 0, 0.0, 0.0, 0.0, 0.0, 0.0)
        out = dict(zip(cols, row, strict=False))
        out["tenant_id"] = tenant_id
        # Coerce nulls → zeros so the frontend never sees `null` here.
        for k in (
            "total_customers", "critical_count", "high_count", "moderate_count",
            "low_count", "avg_risk_score", "avg_health_score",
            "total_revenue", "total_profit", "revenue_at_risk",
        ):
            if out.get(k) is None:
                out[k] = 0
        return out


# --------------- Activity repos ---------------

class OrdersRepo:
    @staticmethod
    def recent(tenant_id: str, customer_id: str, limit: int = 10) -> list[Order]:
        return _fetch(
            Order,
            "SELECT * FROM orders WHERE tenant_id=? AND customer_id=? ORDER BY order_date DESC LIMIT ?",
            (tenant_id, customer_id, limit),
        )

    @staticmethod
    def late_count(tenant_id: str, customer_id: str) -> int:
        con = get_connection()
        row = con.execute(
            "SELECT COUNT(*) FROM orders WHERE tenant_id=? AND customer_id=? AND late_delivery_risk=1",
            (tenant_id, customer_id),
        ).fetchone()
        return int(row[0]) if row else 0


class TicketsRepo:
    @staticmethod
    def recent(tenant_id: str, customer_id: str, limit: int = 10) -> list[SupportTicket]:
        return _fetch(
            SupportTicket,
            """
            SELECT * FROM support_tickets
            WHERE tenant_id=? AND customer_id=?
            ORDER BY date_of_purchase DESC
            LIMIT ?
            """,
            (tenant_id, customer_id, limit),
        )

    @staticmethod
    def open_count(tenant_id: str, customer_id: str) -> int:
        con = get_connection()
        row = con.execute(
            """
            SELECT COUNT(*) FROM support_tickets
            WHERE tenant_id=? AND customer_id=? AND ticket_status NOT ILIKE '%closed%'
            """,
            (tenant_id, customer_id),
        ).fetchone()
        return int(row[0]) if row else 0


class NotesRepo:
    @staticmethod
    def recent(tenant_id: str, customer_id: str, limit: int = 10) -> list[CustomerNote]:
        return _fetch(
            CustomerNote,
            "SELECT * FROM customer_notes WHERE tenant_id=? AND customer_id=? ORDER BY note_date DESC LIMIT ?",
            (tenant_id, customer_id, limit),
        )


class EmailsRepo:
    @staticmethod
    def recent(tenant_id: str, customer_id: str, limit: int = 10) -> list[CustomerEmail]:
        return _fetch(
            CustomerEmail,
            """
            SELECT * FROM customer_email_logs
            WHERE tenant_id=? AND customer_id=?
            ORDER BY date DESC, message_sequence DESC
            LIMIT ?
            """,
            (tenant_id, customer_id, limit),
        )

    @staticmethod
    def thread(tenant_id: str, thread_id: str) -> list[CustomerEmail]:
        return _fetch(
            CustomerEmail,
            """
            SELECT * FROM customer_email_logs
            WHERE tenant_id=? AND thread_id=?
            ORDER BY message_sequence ASC
            """,
            (tenant_id, thread_id),
        )


class ReviewsRepo:
    @staticmethod
    def recent(tenant_id: str, customer_id: str, limit: int = 10) -> list[CustomerReview]:
        return _fetch(
            CustomerReview,
            """
            SELECT * FROM customer_review_logs
            WHERE tenant_id=? AND customer_id=?
            ORDER BY reviewed_at DESC
            LIMIT ?
            """,
            (tenant_id, customer_id, limit),
        )


class OutcomesRepo:
    @staticmethod
    def for_review(tenant_id: str, review_id: str) -> ReviewOutcome | None:
        return _fetch_one(
            ReviewOutcome,
            "SELECT * FROM review_outcomes WHERE tenant_id=? AND review_id=?",
            (tenant_id, review_id),
        )

    @staticmethod
    def pending(tenant_id: str, limit: int = 50) -> list[ReviewOutcome]:
        return _fetch(
            ReviewOutcome,
            "SELECT * FROM review_outcomes WHERE tenant_id=? AND outcome_status='Pending' LIMIT ?",
            (tenant_id, limit),
        )

    @staticmethod
    def pending_followups(tenant_id: str, limit: int = 12) -> list[dict]:
        """Reviews whose outcome is pending or marked follow_up_required.
        Joined with customer to surface names + risk band for the UI."""
        con = get_connection()
        rows = con.execute(
            """
            SELECT
                r.review_id, r.customer_id, r.customer_full_name,
                r.scenario, r.topic, r.reviewed_at, r.human_decision,
                o.outcome_status, o.follow_up_required, o.outcome_date,
                c.risk_band, c.risk_score, c.next_best_action
            FROM customer_review_logs r
            LEFT JOIN review_outcomes o ON o.review_id = r.review_id
            LEFT JOIN customers       c ON c.customer_id = r.customer_id
            WHERE r.tenant_id = ?
              AND (o.outcome_status = 'Pending' OR o.follow_up_required = TRUE OR o.outcome_id IS NULL)
            ORDER BY c.risk_score DESC NULLS LAST, r.reviewed_at DESC
            LIMIT ?
            """,
            (tenant_id, limit),
        ).fetchall()
        return [
            {
                "review_id": r[0],
                "customer_id": r[1],
                "customer_full_name": r[2],
                "scenario": r[3],
                "topic": r[4],
                "reviewed_at": str(r[5]) if r[5] else None,
                "human_decision": r[6],
                "outcome_status": r[7],
                "follow_up_required": bool(r[8]) if r[8] is not None else None,
                "outcome_date": str(r[9]) if r[9] else None,
                "risk_band": r[10],
                "risk_score": r[11],
                "next_best_action": r[12],
            }
            for r in rows
        ]


class EventsRepo:
    @staticmethod
    def engagement(tenant_id: str, customer_id: str, limit: int = 20) -> list[EngagementEvent]:
        return _fetch(
            EngagementEvent,
            """
            SELECT * FROM engagement_events
            WHERE tenant_id=? AND customer_id=?
            ORDER BY event_date DESC
            LIMIT ?
            """,
            (tenant_id, customer_id, limit),
        )

    @staticmethod
    def fulfillment(tenant_id: str, customer_id: str, limit: int = 20) -> list[FulfillmentEvent]:
        return _fetch(
            FulfillmentEvent,
            """
            SELECT * FROM fulfillment_events
            WHERE tenant_id=? AND customer_id=?
            ORDER BY event_date DESC
            LIMIT ?
            """,
            (tenant_id, customer_id, limit),
        )

    @staticmethod
    def unresolved_fulfillment_count(tenant_id: str, customer_id: str) -> int:
        con = get_connection()
        row = con.execute(
            """
            SELECT COUNT(*) FROM fulfillment_events
            WHERE tenant_id=? AND customer_id=?
              AND resolution_status NOT ILIKE '%resolved%'
              AND resolution_status NOT ILIKE '%closed%'
            """,
            (tenant_id, customer_id),
        ).fetchone()
        return int(row[0]) if row else 0


# --------------- ActionsRepo (writes) ---------------

class ActionsRepo:
    """Pending actions queue — Nelson proposes, human decides."""

    @staticmethod
    def insert(action: PendingAction) -> None:
        con = get_connection()
        con.execute(
            """
            INSERT INTO pending_actions
            (action_id, tenant_id, customer_id, customer_full_name, action_type,
             payload_json, status, created_at, decided_at, decided_by,
             nelson_rationale, confidence)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                action.action_id, action.tenant_id, action.customer_id,
                action.customer_full_name, action.action_type, action.payload_json,
                action.status, action.created_at, action.decided_at,
                action.decided_by, action.nelson_rationale, action.confidence,
            ),
        )

    @staticmethod
    def list_pending(tenant_id: str, limit: int = 50) -> list[PendingAction]:
        return _fetch(
            PendingAction,
            """
            SELECT * FROM pending_actions
            WHERE tenant_id=? AND status='pending'
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (tenant_id, limit),
        )

    @staticmethod
    def decide(action_id: str, status: str, decided_by: str, decided_at) -> None:
        con = get_connection()
        con.execute(
            """
            UPDATE pending_actions
            SET status=?, decided_by=?, decided_at=?
            WHERE action_id=?
            """,
            (status, decided_by, decided_at, action_id),
        )

    @staticmethod
    def list_decided(tenant_id: str, limit: int = 20) -> list[dict]:
        """Recently decided actions joined with human_decisions for full provenance."""
        con = get_connection()
        rows = con.execute(
            """
            SELECT
                a.action_id, a.tenant_id, a.customer_id, a.customer_full_name,
                a.action_type, a.payload_json, a.status, a.created_at,
                a.decided_at, a.decided_by, a.nelson_rationale, a.confidence,
                d.decision_id, d.decision_notes
            FROM pending_actions a
            LEFT JOIN human_decisions d ON d.related_action_id = a.action_id
            WHERE a.tenant_id = ? AND a.status IN ('approved', 'rejected')
            ORDER BY a.decided_at DESC NULLS LAST
            LIMIT ?
            """,
            (tenant_id, limit),
        ).fetchall()
        return [
            {
                "action_id": r[0],
                "tenant_id": r[1],
                "customer_id": r[2],
                "customer_full_name": r[3],
                "action_type": r[4],
                "payload_json": r[5],
                "status": r[6],
                "created_at": str(r[7]) if r[7] else None,
                "decided_at": str(r[8]) if r[8] else None,
                "decided_by": r[9],
                "nelson_rationale": r[10],
                "confidence": r[11],
                "decision_id": r[12],
                "decision_notes": r[13],
            }
            for r in rows
        ]
