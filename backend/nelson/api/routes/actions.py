"""Pending actions — Nelson proposes, human decides.

GET   /api/actions/pending           → queue
GET   /api/actions/decided           → audit trail
GET   /api/actions/{id}              → single action
PATCH /api/actions/{id}              → edit pending action payload
POST  /api/actions/{id}/approve      → approve (and, for send_email, actually send)
POST  /api/actions/{id}/reject       → reject
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from nelson.api.middleware import require_session
from nelson.data.db import get_connection
from nelson.data.repositories import ActionsRepo
from nelson.integrations.mail import MailError, NotConfiguredError, send_email

router = APIRouter(prefix="/api/actions", tags=["actions"])


class DecisionRequest(BaseModel):
    notes: str | None = None


class EditPayloadRequest(BaseModel):
    payload_json: str  # the full new JSON payload (already serialized)


@router.get("/pending")
def list_pending(session: dict = Depends(require_session)) -> list[dict]:
    actions = ActionsRepo.list_pending(session["tenant_id"])
    return [a.model_dump(mode="json") for a in actions]


@router.get("/decided")
def list_decided(limit: int = 20, session: dict = Depends(require_session)) -> list[dict]:
    """The audit trail — actions that have been approved or rejected, with full provenance."""
    return ActionsRepo.list_decided(session["tenant_id"], limit=limit)


@router.get("/{action_id}")
def get_action(action_id: str, session: dict = Depends(require_session)) -> dict:
    """Fetch a single action by ID — used by the chat widget to render
    inline cards for actions Nelson just drafted."""
    con = get_connection()
    row = con.execute(
        """
        SELECT action_id, tenant_id, customer_id, customer_full_name,
               action_type, payload_json, status, created_at, decided_at,
               decided_by, nelson_rationale, confidence
        FROM pending_actions
        WHERE action_id=? AND tenant_id=?
        """,
        (action_id, session["tenant_id"]),
    ).fetchone()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"action {action_id} not found")
    return {
        "action_id": row[0],
        "tenant_id": row[1],
        "customer_id": row[2],
        "customer_full_name": row[3],
        "action_type": row[4],
        "payload_json": row[5],
        "status": row[6],
        "created_at": str(row[7]) if row[7] else None,
        "decided_at": str(row[8]) if row[8] else None,
        "decided_by": row[9],
        "nelson_rationale": row[10],
        "confidence": row[11],
    }


def _decide(action_id: str, status_value: str, session: dict, notes: str | None) -> dict:
    full = ActionsRepo.get(session["tenant_id"], action_id)
    if not full:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"action {action_id} not found")

    decided_at = datetime.utcnow()
    ActionsRepo.decide(action_id, status_value, session["user_id"], decided_at)
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
            session["tenant_id"],
            full["customer_id"],
            full["customer_full_name"],
            status_value,
            session["user_id"],
            decided_at,
            notes,
            action_id,
        ),
    )

    result = {
        "action_id": action_id,
        "status": status_value,
        "decided_at": str(decided_at),
    }

    # On approval of a send_email action, actually send via Gmail SMTP.
    if status_value == "approved" and full["action_type"] == "send_email":
        try:
            payload = json.loads(full["payload_json"] or "{}")
        except json.JSONDecodeError as e:
            err = f"payload not parseable: {e.msg}"
            ActionsRepo.mark_sent(action_id, None, err)
            result["sent"] = False
            result["send_error"] = err
            return result

        try:
            send_email(
                to=payload.get("to") or "",
                subject=payload.get("subject") or "",
                body=payload.get("body") or "",
                reply_to=payload.get("reply_to"),
            )
            sent_at = datetime.utcnow()
            ActionsRepo.mark_sent(action_id, sent_at, None)
            result["sent"] = True
            result["sent_at"] = str(sent_at)
            result["sent_to"] = payload.get("to")
            print(f"  [mail] sent {action_id} -> {payload.get('to')}")
        except NotConfiguredError as e:
            # Not an error per se — the human still approved; just no auto-send.
            ActionsRepo.mark_sent(action_id, None, str(e))
            result["sent"] = False
            result["send_error"] = str(e)
            print(f"  [mail] approved but not sent (gmail not configured): {action_id}")
        except MailError as e:
            ActionsRepo.mark_sent(action_id, None, str(e))
            result["sent"] = False
            result["send_error"] = str(e)
            print(f"  [mail] send FAILED for {action_id}: {e}")

    return result


@router.patch("/{action_id}")
def edit_payload(
    action_id: str,
    req: EditPayloadRequest,
    session: dict = Depends(require_session),
) -> dict:
    """Edit a pending action's payload (e.g. revise email subject/body).
    Cannot edit actions that have already been approved or rejected."""
    # Validate that the new payload is valid JSON before saving.
    try:
        json.loads(req.payload_json)
    except json.JSONDecodeError as e:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"payload_json must be valid JSON: {e.msg}",
        )
    ok = ActionsRepo.update_payload(action_id, session["tenant_id"], req.payload_json)
    if not ok:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            f"action {action_id} not found, not pending, or not in your tenant",
        )
    return {"action_id": action_id, "updated": True}


@router.post("/{action_id}/approve")
def approve(
    action_id: str,
    req: DecisionRequest = DecisionRequest(),
    session: dict = Depends(require_session),
) -> dict:
    return _decide(action_id, "approved", session, req.notes)


@router.post("/{action_id}/reject")
def reject(
    action_id: str,
    req: DecisionRequest = DecisionRequest(),
    session: dict = Depends(require_session),
) -> dict:
    return _decide(action_id, "rejected", session, req.notes)
