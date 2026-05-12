"""Shared decision/send service.

Both the HTTP API (`api/routes/actions.py`) and the Telegram bot
(`ai/telegram_bot.py`) need the same logic when a human approves or rejects
a Nelson-drafted action:

  1. Record the decision in `pending_actions` + `human_decisions` (audit trail).
  2. If the action is `send_email` AND status is `approved`, attempt to send
     it via Gmail SMTP and record `sent_at` or `send_error`.

Living here keeps both surfaces in lockstep — there's no "approved via Telegram
but never sent" gap.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime

from nelson.data.db import get_connection
from nelson.data.repositories import ActionsRepo
from nelson.integrations.mail import MailError, NotConfiguredError, send_email


class DecisionError(RuntimeError):
    """Decision could not be recorded (action not found, wrong tenant, etc.)."""


def decide_action(
    *,
    tenant_id: str,
    user_id: str,
    action_id: str,
    status_value: str,
    notes: str | None = None,
) -> dict:
    """Record a human decision on a pending action; send email if applicable.

    Returns:
        Dict with keys:
          - action_id, status, decided_at
          - sent (bool): set only for send_email approvals
          - sent_at, sent_to (str): set on successful send
          - send_error (str): set on send failure or not-configured

    Raises:
        DecisionError if the action doesn't exist or isn't in this tenant.
    """
    if status_value not in ("approved", "rejected"):
        raise DecisionError(f"status_value must be 'approved' or 'rejected', got {status_value!r}")

    full = ActionsRepo.get(tenant_id, action_id)
    if not full:
        raise DecisionError(f"action {action_id} not found in tenant {tenant_id}")

    decided_at = datetime.utcnow()
    ActionsRepo.decide(action_id, status_value, user_id, decided_at)

    con = get_connection()
    con.execute(
        """
        INSERT INTO human_decisions
        (decision_id, tenant_id, customer_id, customer_full_name, decision,
         decided_by, decided_at, decision_notes, related_action_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            f"DEC-{uuid.uuid4().hex[:12]}",
            tenant_id,
            full["customer_id"],
            full["customer_full_name"],
            status_value,
            user_id,
            decided_at,
            notes,
            action_id,
        ),
    )

    result: dict = {
        "action_id": action_id,
        "status": status_value,
        "decided_at": str(decided_at),
    }

    # Auto-send if this is an approved email and Gmail is configured.
    if status_value == "approved" and full["action_type"] == "send_email":
        result.update(_attempt_send(full))

    return result


def _attempt_send(action: dict) -> dict:
    """Try to send the email behind a pending_action and record the outcome."""
    action_id = action["action_id"]
    try:
        payload = json.loads(action["payload_json"] or "{}")
    except json.JSONDecodeError as e:
        err = f"payload not parseable: {e.msg}"
        ActionsRepo.mark_sent(action_id, None, err)
        return {"sent": False, "send_error": err}

    try:
        send_email(
            to=payload.get("to") or "",
            subject=payload.get("subject") or "",
            body=payload.get("body") or "",
            reply_to=payload.get("reply_to"),
        )
        sent_at = datetime.utcnow()
        ActionsRepo.mark_sent(action_id, sent_at, None)
        print(f"  [mail] sent {action_id} -> {payload.get('to')}")
        return {
            "sent": True,
            "sent_at": str(sent_at),
            "sent_to": payload.get("to"),
        }
    except NotConfiguredError as e:
        ActionsRepo.mark_sent(action_id, None, str(e))
        print(f"  [mail] approved but not sent (gmail not configured): {action_id}")
        return {"sent": False, "send_error": str(e)}
    except MailError as e:
        ActionsRepo.mark_sent(action_id, None, str(e))
        print(f"  [mail] send FAILED for {action_id}: {e}")
        return {"sent": False, "send_error": str(e)}
