"""Account-level views — the drill-in surface."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from nelson.api.middleware import require_session
from nelson.data.repositories import (
    AccountsRepo,
    EmailsRepo,
    EventsRepo,
    NotesRepo,
    OrdersRepo,
    ReviewsRepo,
    TicketsRepo,
)

router = APIRouter(prefix="/api/accounts", tags=["accounts"])


@router.get("")
def list_accounts(
    limit: int = 50,
    offset: int = 0,
    search: str | None = None,
    session: dict = Depends(require_session),
) -> list[dict]:
    tenant = session["tenant_id"]
    if search:
        accounts = AccountsRepo.search(tenant, search, limit=limit)
    else:
        accounts = AccountsRepo.list(tenant, limit=limit, offset=offset)
    return [a.model_dump(mode="json") for a in accounts]


@router.get("/{customer_id}")
def get_account(customer_id: str, session: dict = Depends(require_session)) -> dict:
    cust = AccountsRepo.get_by_id(session["tenant_id"], customer_id)
    if not cust:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"customer {customer_id} not found")
    return cust.model_dump(mode="json")


@router.get("/{customer_id}/activity")
def get_activity(
    customer_id: str,
    session: dict = Depends(require_session),
) -> dict:
    """All recent activity for an account, grouped by kind. Drives the drill-in panel."""
    tenant = session["tenant_id"]
    cust = AccountsRepo.get_by_id(tenant, customer_id)
    if not cust:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"customer {customer_id} not found")
    return {
        "customer": cust.model_dump(mode="json"),
        "orders": [o.model_dump(mode="json") for o in OrdersRepo.recent(tenant, customer_id, 10)],
        "tickets": [t.model_dump(mode="json") for t in TicketsRepo.recent(tenant, customer_id, 10)],
        "notes": [n.model_dump(mode="json") for n in NotesRepo.recent(tenant, customer_id, 10)],
        "emails": [e.model_dump(mode="json") for e in EmailsRepo.recent(tenant, customer_id, 10)],
        "engagement": [e.model_dump(mode="json") for e in EventsRepo.engagement(tenant, customer_id, 20)],
        "fulfillment": [f.model_dump(mode="json") for f in EventsRepo.fulfillment(tenant, customer_id, 20)],
        "reviews": [r.model_dump(mode="json") for r in ReviewsRepo.recent(tenant, customer_id, 10)],
    }
