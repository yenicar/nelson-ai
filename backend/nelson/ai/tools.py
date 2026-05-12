"""Tools Nelson can call.

Each tool is a Python function with a docstring + type hints — Gemini's
auto-function-calling reads the signature and docstring directly. Tools are
tenant-scoped via a closure factory so the LLM never sees `tenant_id`.

The `propose_action` tool is the only write path. Everything Nelson "does" lands
in `pending_actions` for human approval.
"""
from __future__ import annotations

import functools
import json
import traceback
import uuid
from datetime import datetime
from typing import Any, Callable

from nelson.data.repositories import (
    AccountsRepo,
    ActionsRepo,
    EmailsRepo,
    EventsRepo,
    NotesRepo,
    OrdersRepo,
    OutcomesRepo,
    TicketsRepo,
)
from nelson.data.schemas import PendingAction

VALID_ACTION_TYPES = {
    "send_email",
    "proactive_outreach",
    "reclassify_band",
    "update_lifecycle",
    "escalate",
    "schedule_followup",
    "recommend_credit",
    "recommend_expedite",
    "add_note",
}


def _safe_tool(fn: Callable) -> Callable:
    """Wrap a tool with logging + exception → {"error": ...} fallback.

    Implementation note: the wrapper preserves the wrapped function's
    `__signature__` and `__annotations__` explicitly (not just via
    `@functools.wraps`). Some versions of the google.genai SDK introspect
    parameter types via `inspect.signature(fn, follow_wrapped=False)` or
    similar and miss the `__wrapped__` link, which would surface as
    `isinstance() arg 2 must be a type, a tuple of types, or a union` —
    because the wrapper's literal `*args, **kwargs` has no concrete types.
    Setting `__signature__` directly fixes that.
    """
    import inspect

    sig = inspect.signature(fn)

    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        # Some SDK versions pass positional args; bind them via the signature
        # to get a consistent kwargs-only view for logging.
        try:
            bound = sig.bind(*args, **kwargs)
            bound.apply_defaults()
            call_kwargs = dict(bound.arguments)
        except TypeError:
            call_kwargs = kwargs  # fall back if signature binding fails
        kw_preview = ", ".join(
            f"{k}={_short(v)}" for k, v in call_kwargs.items()
        )
        print(f"  [tool] -> {fn.__name__}({kw_preview})")
        try:
            result = fn(*args, **kwargs)
            if isinstance(result, dict) and "error" in result:
                print(f"  [tool] <- {fn.__name__} ERROR: {result['error']}")
            else:
                summary = _outcome_summary(result)
                print(f"  [tool] <- {fn.__name__} ok: {summary}")
            return result
        except Exception as e:
            tb = traceback.format_exc()
            print(f"  [tool] {fn.__name__} CRASHED: {type(e).__name__}: {e}")
            print(tb)
            return {
                "error": f"Tool '{fn.__name__}' raised {type(e).__name__}: {e}",
                "tool": fn.__name__,
            }

    # Pin signature + annotations on the wrapper itself so any SDK
    # introspection path (signature, type_hints, annotations dict) returns
    # the wrapped function's types, not the wrapper's `**kwargs`.
    wrapper.__signature__ = sig  # type: ignore[attr-defined]
    wrapper.__annotations__ = dict(fn.__annotations__)
    return wrapper


def _outcome_summary(result) -> str:
    if isinstance(result, list):
        return f"{len(result)} item{'s' if len(result) != 1 else ''}"
    if isinstance(result, dict):
        if "action_id" in result:
            return f"action {result['action_id']} queued"
        if "match" in result:
            m = result["match"]
            return f"matched {m.get('name', '?')} ({m.get('customer_id', '?')})"
        if "not_found" in result:
            return "not_found (valid result)"
        if "total_customers" in result:
            return f"summary: {result.get('total_customers', 0)} customers"
        return f"{len(result)} field{'s' if len(result) != 1 else ''}"
    return _short(result)


def _short(v: Any) -> str:
    """Truncate a value for log output."""
    s = repr(v)
    return s if len(s) <= 80 else s[:77] + "..."


def _slim_customer(c: Any) -> dict:
    """Trim a Customer model to fields useful for an LLM context."""
    return {
        "customer_id": c.customer_id,
        "name": c.customer_full_name,
        "email": c.customer_email,
        "segment": c.customer_segment,
        "country": c.customer_country,
        "total_orders": c.total_orders,
        "total_sales": c.total_sales,
        "total_profit": c.total_profit,
        "late_delivery_rate": c.late_delivery_rate,
        "support_ticket_count": c.support_ticket_count,
        "open_tickets": c.open_support_ticket_count,
        "risk_score": c.risk_score,
        "risk_band": c.risk_band,
        "health_score": c.health_score,
        "lifecycle_stage": c.lifecycle_stage,
        "churn_risk_reason": c.churn_risk_reason,
        "next_best_action": c.next_best_action,
        "last_review_decision": c.last_review_decision,
    }


def make_tools(tenant_id: str) -> list[Callable]:
    """Return Python callables bound to a tenant. Pass to Gemini as `tools=`."""

    def find_customer(name: str) -> dict:
        """Find a customer by full name (case-insensitive, fuzzy).

        Possible return shapes — handle ALL of them:
        - {"match": {...}}                          — single match, proceed
        - {"match": {...}, "also_matched": [...]}   — multiple same-name; chose highest-risk
        - {"not_found_exact": true, "suggestions": [...]} — no exact match, but found
                                                       similar last-name candidates
        - {"not_found": true, "message": "..."}     — truly does not exist in this portfolio
        """
        name = (name or "").strip()
        if not name:
            return {"not_found": True, "message": "Empty name."}

        # 1. Exact (case-insensitive) match
        exact = AccountsRepo.get_by_name(tenant_id, name)
        if exact:
            others = [
                c for c in AccountsRepo.search(tenant_id, name, limit=6)
                if c.customer_id != exact.customer_id
                and c.customer_full_name.lower() == name.lower()
            ]
            result: dict = {"match": _slim_customer(exact)}
            if others:
                result["also_matched"] = [
                    {"name": c.customer_full_name, "customer_id": c.customer_id,
                     "risk_band": c.risk_band, "country": c.customer_country}
                    for c in others
                ]
            return result

        # 2. Fuzzy whole-name LIKE match
        candidates = AccountsRepo.search(tenant_id, name, limit=5)
        if len(candidates) == 1:
            return {"match": _slim_customer(candidates[0])}
        if len(candidates) > 1:
            candidates.sort(key=lambda c: (c.risk_score or 0), reverse=True)
            chosen = candidates[0]
            return {
                "match": _slim_customer(chosen),
                "also_matched": [
                    {"name": c.customer_full_name, "customer_id": c.customer_id,
                     "risk_band": c.risk_band, "country": c.customer_country}
                    for c in candidates[1:]
                ],
                "ambiguity_note": (
                    f"Multiple customers match '{name}'. Picked highest-risk "
                    f"({chosen.customer_full_name}, {chosen.customer_id}, {chosen.risk_band}). "
                    f"Disclose this to the user and offer to switch."
                ),
            }

        # 3. No whole-name match. Fall back to last-name search.
        parts = name.split()
        if len(parts) >= 2:
            last_name = parts[-1]
            ln = AccountsRepo.search(tenant_id, last_name, limit=8)
            if ln:
                return {
                    "not_found_exact": True,
                    "message": (
                        f"No customer named '{name}' is in this portfolio, but "
                        f"these customers share the last name '{last_name}'. "
                        f"Ask the user which one they meant."
                    ),
                    "suggestions": [
                        {"name": c.customer_full_name, "customer_id": c.customer_id,
                         "risk_band": c.risk_band, "country": c.customer_country}
                        for c in ln[:5]
                    ],
                }

        # 4. Truly not in portfolio.
        return {
            "not_found": True,
            "message": (
                f"'{name}' is not in this portfolio of 2,000 customers. "
                f"This is NOT a system error — the customer simply doesn't exist here. "
                f"Tell the user clearly that you don't see this name and ask them "
                f"to double-check the spelling or give a customer_id."
            ),
        }

    def get_customers_by_ids(customer_ids: str) -> list:
        """Resolve customer IDs to full profiles in one call.

        Use this when you already know IDs (e.g., from a prior get_top_at_risk
        call in this conversation) — it's faster than calling find_customer
        for each name and avoids name-collision ambiguity.

        Pass a COMMA-SEPARATED string of customer_ids.
            Example: "C000037, C000325, C001247"
        """
        out: list = []
        for raw in (customer_ids or "").split(","):
            sid = raw.strip()
            if not sid:
                continue
            c = AccountsRepo.get_by_id(tenant_id, sid)
            if c:
                out.append(_slim_customer(c))
        return out

    def get_customer_profile(customer_id: str) -> dict:
        """Get a full profile for a customer: account info, risk metrics, lifecycle stage."""
        c = AccountsRepo.get_by_id(tenant_id, customer_id)
        if not c:
            return {"error": f"customer_id {customer_id} not found"}
        return _slim_customer(c)

    def get_recent_orders(customer_id: str, limit: int = 10) -> list[dict]:
        """Get a customer's recent orders, newest first. Useful for delivery and revenue history."""
        return [
            {
                "order_id": o.order_id,
                "order_date": str(o.order_date) if o.order_date else None,
                "status": o.order_status,
                "delivery": o.delivery_status,
                "late_risk": o.late_delivery_risk,
                "sales": o.order_sales,
                "profit": o.order_profit,
                "issue_flag": o.issue_flag,
            }
            for o in OrdersRepo.recent(tenant_id, customer_id, limit)
        ]

    def get_recent_tickets(customer_id: str, limit: int = 10) -> list[dict]:
        """Get a customer's recent support tickets, newest first."""
        return [
            {
                "ticket_id": t.ticket_id,
                "date": str(t.date_of_purchase) if t.date_of_purchase else None,
                "type": t.ticket_type,
                "subject": t.ticket_subject,
                "priority": t.ticket_priority,
                "status": t.ticket_status,
                "resolution_hours": t.resolution_time_hours,
                "satisfaction": t.customer_satisfaction_rating,
                "sentiment": t.customer_sentiment,
            }
            for t in TicketsRepo.recent(tenant_id, customer_id, limit)
        ]

    def get_recent_notes(customer_id: str, limit: int = 10) -> list[dict]:
        """Get internal notes about a customer, newest first. These are what reviewers wrote."""
        return [
            {
                "note_id": n.note_id,
                "date": str(n.note_date) if n.note_date else None,
                "scenario": n.scenario,
                "topic": n.topic,
                "author": n.author,
                "type": n.note_type,
                "text": n.note_text,
                "source_signal_ids": n.source_signal_ids,
            }
            for n in NotesRepo.recent(tenant_id, customer_id, limit)
        ]

    def get_recent_emails(customer_id: str, limit: int = 10) -> list[dict]:
        """Get recent customer email exchanges, newest first."""
        return [
            {
                "email_id": e.email_id,
                "thread_id": e.thread_id,
                "date": str(e.date) if e.date else None,
                "direction": e.direction,
                "scenario": e.scenario,
                "topic": e.topic,
                "subject": e.subject,
                "body": e.body,
                "sentiment_hint": e.sentiment_hint,
            }
            for e in EmailsRepo.recent(tenant_id, customer_id, limit)
        ]

    def get_engagement_events(customer_id: str, limit: int = 20) -> list[dict]:
        """Get recent engagement events (campaign opens, clicks, channels) for a customer."""
        return [
            {
                "engagement_id": e.engagement_id,
                "date": str(e.event_date) if e.event_date else None,
                "type": e.event_type,
                "campaign": e.campaign,
                "channel": e.channel,
                "score": e.engagement_score,
            }
            for e in EventsRepo.engagement(tenant_id, customer_id, limit)
        ]

    def get_fulfillment_issues(customer_id: str, limit: int = 20) -> list[dict]:
        """Get fulfillment events (delays, carrier issues, root causes) for a customer."""
        return [
            {
                "id": f.fulfillment_event_id,
                "order_id": f.order_id,
                "date": str(f.event_date) if f.event_date else None,
                "type": f.event_type,
                "severity": f.severity,
                "root_cause": f.root_cause,
                "resolution_status": f.resolution_status,
            }
            for f in EventsRepo.fulfillment(tenant_id, customer_id, limit)
        ]

    def get_top_by_revenue(limit: int = 10, ascending: bool = False) -> list[dict]:
        """Get top-N customers ranked by total revenue (`total_sales`).

        Args:
            limit: how many to return.
            ascending: False for highest revenue first (default), True for lowest.
        Use for queries like "highest revenue customer", "biggest accounts",
        "smallest accounts", "who's our most valuable customer".
        """
        accounts = AccountsRepo.top_by_revenue(tenant_id, limit, ascending)
        return [
            {
                "name": c.customer_full_name,
                "customer_id": c.customer_id,
                "total_sales": c.total_sales,
                "total_profit": c.total_profit,
                "risk_band": c.risk_band,
                "segment": c.customer_segment,
                "country": c.customer_country,
            }
            for c in accounts
        ]

    def search_customers_by_prefix(prefix: str, limit: int = 20) -> list[dict]:
        """Find customers whose full name starts with a given prefix (case-insensitive).

        Use for queries like "customers starting with A", "names beginning with M",
        "everyone whose first name is John".
        """
        return [
            {
                "name": c.customer_full_name,
                "customer_id": c.customer_id,
                "risk_band": c.risk_band,
                "risk_score": c.risk_score,
                "total_sales": c.total_sales,
                "country": c.customer_country,
            }
            for c in AccountsRepo.search_by_prefix(tenant_id, prefix, limit)
        ]

    def get_top_at_risk(limit: int = 10, band: str = "") -> list[dict]:
        """Get top-N customers by risk_score (descending), optionally filtered by band.

        Args:
            limit: how many to return (default 10).
            band: optional risk_band filter. Pass one of "Critical", "High",
                  "Moderate", "Elevated", "Low" to restrict, or leave empty
                  to return overall top-N.
        """
        if band:
            accounts = AccountsRepo.by_band(tenant_id, band, limit=limit)
            # by_band doesn't sort; sort by risk_score desc here.
            accounts.sort(key=lambda c: (c.risk_score or 0), reverse=True)
        else:
            accounts = AccountsRepo.top_at_risk(tenant_id, limit)
        return [
            {
                "name": c.customer_full_name,
                "customer_id": c.customer_id,
                "risk_band": c.risk_band,
                "risk_score": c.risk_score,
                "lifecycle_stage": c.lifecycle_stage,
                "churn_risk_reason": c.churn_risk_reason,
                "next_best_action": c.next_best_action,
            }
            for c in accounts
        ]

    def get_portfolio_summary() -> dict:
        """Get a portfolio-level summary: total customers, band distribution, total revenue/profit."""
        return AccountsRepo.portfolio_summary(tenant_id)

    def get_pending_review_outcomes(limit: int = 20) -> list[dict]:
        """Get reviews whose outcome is still Pending — accounts awaiting follow-up."""
        return [
            {
                "outcome_id": o.outcome_id,
                "review_id": o.review_id,
                "customer_name": o.customer_full_name,
                "follow_up_required": o.follow_up_required,
            }
            for o in OutcomesRepo.pending(tenant_id, limit)
        ]

    def propose_action(
        customer_id: str,
        action_type: str,
        payload_json: str,
        rationale: str,
        confidence: float = 0.7,
    ) -> dict:
        """Queue an action for human approval. Nelson never executes — the human decides.

        Args:
            customer_id: the customer_id (e.g. "C000037") this action targets.
            action_type: one of "send_email", "proactive_outreach", "reclassify_band",
                "update_lifecycle", "escalate", "schedule_followup", "recommend_credit",
                "recommend_expedite", "add_note".
            payload_json: a JSON-ENCODED STRING with the action-specific fields.
                IMPORTANT: this must be a string (use json.dumps mentally), NOT a raw
                object. Examples (each is a string):
                  send_email:        '{"to":"a@b.com","subject":"...","body":"..."}'
                  update_lifecycle:  '{"new_stage":"Active"}'
                  add_note:          '{"text":"Customer reported X..."}'
                  recommend_credit:  '{"amount":250,"reason":"late delivery"}'
            rationale: 1-2 sentence explanation of why this action is recommended.
            confidence: float 0.0-1.0 expressing how sure you are.
        """
        if action_type not in VALID_ACTION_TYPES:
            return {"error": f"action_type must be one of {sorted(VALID_ACTION_TYPES)}"}

        # Normalize payload to a JSON string — accept dict, str, or anything.
        if isinstance(payload_json, dict):
            try:
                payload_str = json.dumps(payload_json, default=str)
            except Exception as e:
                return {"error": f"could not serialize payload dict: {e}"}
        elif isinstance(payload_json, str):
            if not payload_json.strip():
                payload_str = "{}"
            else:
                try:
                    json.loads(payload_json)
                    payload_str = payload_json
                except json.JSONDecodeError:
                    # Model gave us a plain string — wrap it.
                    payload_str = json.dumps({"text": payload_json})
        elif payload_json is None:
            payload_str = "{}"
        else:
            # list, number, etc. — coerce to JSON
            try:
                payload_str = json.dumps(payload_json, default=str)
            except Exception:
                payload_str = json.dumps({"value": str(payload_json)})

        cust = AccountsRepo.get_by_id(tenant_id, customer_id)
        if not cust:
            return {"error": f"customer_id '{customer_id}' not found in this portfolio"}

        action = PendingAction(
            action_id=f"ACT-{uuid.uuid4().hex[:12]}",
            tenant_id=tenant_id,
            customer_id=customer_id,
            customer_full_name=cust.customer_full_name,
            action_type=action_type,
            payload_json=payload_str,
            status="pending",
            created_at=datetime.utcnow(),
            nelson_rationale=rationale,
            confidence=max(0.0, min(1.0, confidence)),
        )
        ActionsRepo.insert(action)
        print(f"  [tool] propose_action OK: {action.action_id} {action_type} for {cust.customer_full_name}")
        return {
            "action_id": action.action_id,
            "queued_for": cust.customer_full_name,
            "type": action_type,
            "status": "pending_human_approval",
        }

    raw_tools = [
        find_customer,
        get_customers_by_ids,
        get_customer_profile,
        get_recent_orders,
        get_recent_tickets,
        get_recent_notes,
        get_recent_emails,
        get_engagement_events,
        get_fulfillment_issues,
        get_top_at_risk,
        get_top_by_revenue,
        search_customers_by_prefix,
        get_portfolio_summary,
        get_pending_review_outcomes,
        propose_action,
    ]
    # Wrap every tool with the defensive logger.
    return [_safe_tool(t) for t in raw_tools]
