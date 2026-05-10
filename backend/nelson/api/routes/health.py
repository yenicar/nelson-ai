"""Health check — public, used by frontend startup + load balancers later."""
from __future__ import annotations

from fastapi import APIRouter

from nelson.config.settings import settings
from nelson.data.db import get_connection

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
def health() -> dict:
    con = get_connection()
    rows = con.execute("SELECT COUNT(*) FROM customers").fetchone()
    customer_count = int(rows[0]) if rows else 0
    return {
        "ok": True,
        "model": settings.gemini_model,
        "model_key_configured": bool(settings.gemini_api_key),
        "customers_loaded": customer_count,
        "tenant": settings.default_tenant_id,
    }
