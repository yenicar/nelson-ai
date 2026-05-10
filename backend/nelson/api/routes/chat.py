"""Chat — Nelson conversation surface.

POST /api/chat              { message, session_id? } → final text + session_id
POST /api/chat/stream       { message, session_id? } → SSE stream of tool calls + final text
GET  /api/chat/sessions/{id}/messages → history
"""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from nelson.ai.agent import NelsonError, ask, stream_ask
from nelson.api.middleware import require_session
from nelson.data.db import get_connection

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None
    use_cache: bool = False


class ChatResponse(BaseModel):
    response: str
    session_id: str
    cached: bool


@router.post("", response_model=ChatResponse)
def chat(req: ChatRequest, session: dict = Depends(require_session)) -> ChatResponse:
    try:
        result = ask(
            req.message,
            tenant_id=session["tenant_id"],
            user_id=session["user_id"],
            surface="dashboard",
            session_id=req.session_id,
            use_cache=req.use_cache,
        )
    except NelsonError as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e))
    return ChatResponse(**result)


@router.post("/stream")
async def chat_stream(req: ChatRequest, session: dict = Depends(require_session)):
    """SSE stream of Nelson's reasoning. Each event is one tool call, tool
    result, message chunk, or status update."""

    async def event_source():
        try:
            async for event in stream_ask(
                req.message,
                tenant_id=session["tenant_id"],
                user_id=session["user_id"],
                surface="dashboard",
                session_id=req.session_id,
            ):
                yield f"data: {json.dumps(event, default=str)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': f'{type(e).__name__}: {e}'})}\n\n"

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/sessions/{session_id}/messages")
def get_messages(session_id: str, session: dict = Depends(require_session)) -> list[dict]:
    con = get_connection()
    rows = con.execute(
        """
        SELECT m.role, m.content, m.created_at
        FROM nelson_messages m
        JOIN nelson_sessions s ON s.session_id = m.session_id
        WHERE m.session_id=? AND s.tenant_id=?
        ORDER BY m.created_at ASC
        """,
        (session_id, session["tenant_id"]),
    ).fetchall()
    return [{"role": r[0], "content": r[1], "created_at": str(r[2])} for r in rows]
