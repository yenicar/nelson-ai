"""Auth + session for the demo.

Single-user developer login (email/password from .env). On success we set a
signed cookie that carries `user_id|tenant_id|expires`. Requests without a
valid cookie are rejected by `require_session`.

Stateless, server-restart-safe. Replace with real auth (OAuth/OIDC) post-class.
"""
from __future__ import annotations

import hashlib
import hmac
import time
from typing import Annotated

from fastapi import Cookie, HTTPException, status

from nelson.config.settings import settings

COOKIE_NAME = "nelson_session"
SESSION_TTL_SECONDS = 60 * 60 * 24 * 7  # 7 days


def _sign(payload: str) -> str:
    mac = hmac.new(settings.session_secret.encode(), payload.encode(), hashlib.sha256)
    return mac.hexdigest()[:32]


def issue_token(user_id: str, tenant_id: str) -> str:
    expires = int(time.time()) + SESSION_TTL_SECONDS
    payload = f"{user_id}|{tenant_id}|{expires}"
    return f"{payload}|{_sign(payload)}"


def parse_token(token: str) -> dict | None:
    try:
        user_id, tenant_id, expires_str, signature = token.split("|")
    except ValueError:
        return None
    payload = f"{user_id}|{tenant_id}|{expires_str}"
    if not hmac.compare_digest(signature, _sign(payload)):
        return None
    if int(expires_str) < int(time.time()):
        return None
    return {"user_id": user_id, "tenant_id": tenant_id, "expires": int(expires_str)}


def require_session(
    nelson_session: Annotated[str | None, Cookie()] = None,
) -> dict:
    if not nelson_session:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    session = parse_token(nelson_session)
    if not session:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired session")
    return session
