"""Portfolio-level views — the company-wide dashboard surface."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from nelson.api.middleware import require_session
from nelson.data.repositories import AccountsRepo, ActionsRepo, OutcomesRepo

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


@router.get("/summary")
def summary(session: dict = Depends(require_session)) -> dict:
    return AccountsRepo.portfolio_summary(session["tenant_id"])


@router.get("/top-at-risk")
def top_at_risk(limit: int = 10, session: dict = Depends(require_session)) -> list[dict]:
    accounts = AccountsRepo.top_at_risk(session["tenant_id"], limit=limit)
    return [a.model_dump(mode="json") for a in accounts]


@router.get("/pending-followups")
def pending_followups(limit: int = 12, session: dict = Depends(require_session)) -> list[dict]:
    """Predictive lane — reviews awaiting outcome / flagged for follow-up."""
    return OutcomesRepo.pending_followups(session["tenant_id"], limit=limit)


@router.get("/sentiment")
def portfolio_sentiment(session: dict = Depends(require_session)) -> dict:
    """Aggregate sentiment breakdown across all email + ticket signals."""
    return AccountsRepo.portfolio_sentiment(session["tenant_id"])


@router.get("/dashboard")
def dashboard(session: dict = Depends(require_session)) -> dict:
    """Single endpoint for the dashboard — descriptive + diagnostic + predictive + prescriptive.
    Returns everything the dashboard needs in one round trip."""
    tenant = session["tenant_id"]
    accounts = AccountsRepo.top_at_risk(tenant, limit=60)
    return {
        "summary": AccountsRepo.portfolio_summary(tenant),
        "portfolio_sentiment": AccountsRepo.portfolio_sentiment(tenant),
        "accounts": [a.model_dump(mode="json") for a in accounts],
        "sentiment": AccountsRepo.sentiment_for_customers(
            tenant, [a.customer_id for a in accounts]
        ),
        "pending_followups": OutcomesRepo.pending_followups(tenant, limit=10),
        "pending_actions": [a.model_dump(mode="json") for a in ActionsRepo.list_pending(tenant, limit=20)],
    }
