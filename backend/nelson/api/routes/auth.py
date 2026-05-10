"""Auth — developer login for v1.

POST /api/auth/login   { email, password } → 200 + cookie
GET  /api/auth/me      → current session (or 401)
POST /api/auth/logout  → clears cookie
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel

from nelson.api.middleware import COOKIE_NAME, SESSION_TTL_SECONDS, issue_token, require_session
from nelson.config.settings import settings

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class SessionInfo(BaseModel):
    user_id: str
    tenant_id: str
    tenant_name: str


@router.post("/login", response_model=SessionInfo)
def login(req: LoginRequest, response: Response) -> SessionInfo:
    if req.email != settings.dev_login_email or req.password != settings.dev_login_password:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    user_id = req.email
    tenant_id = settings.default_tenant_id
    token = issue_token(user_id, tenant_id)
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=SESSION_TTL_SECONDS,
        httponly=True,
        samesite="lax",
        secure=False,  # dev only
    )
    return SessionInfo(
        user_id=user_id,
        tenant_id=tenant_id,
        tenant_name=settings.default_tenant_name,
    )


@router.get("/me", response_model=SessionInfo)
def me(session: dict = Depends(require_session)) -> SessionInfo:
    return SessionInfo(
        user_id=session["user_id"],
        tenant_id=session["tenant_id"],
        tenant_name=settings.default_tenant_name,
    )


@router.post("/logout")
def logout(response: Response) -> dict:
    response.delete_cookie(COOKIE_NAME)
    return {"ok": True}
