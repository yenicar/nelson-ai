"""Nelson — the multi-step agent.

Two interfaces:

- `ask()` — synchronous, uses Gemini's automatic function-calling. Telegram
  and CLI use this. The SDK manages the tool-call loop internally.
- `stream_ask()` — async generator. Yields each tool call and result as it
  happens, so the UI can render Nelson's reasoning in real time. The
  dashboard chat uses this. Implements the loop manually so we have full
  visibility into each step.

Both share session memory and the same tool surface.
"""
from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncIterator
from datetime import datetime
from typing import Any, Iterable

from google import genai
from google.genai import types

from nelson.ai import cache
from nelson.ai.prompts import morning_brief_prompt, system_prompt
from nelson.ai.tools import make_tools
from nelson.config.settings import settings
from nelson.data.db import get_connection


class NelsonError(RuntimeError):
    pass


def _client() -> genai.Client:
    if not settings.gemini_api_key:
        raise NelsonError(
            "GEMINI_API_KEY not set. Paste your key into nelson_ai/.env "
            "(copy from .env.example first)."
        )
    return genai.Client(api_key=settings.gemini_api_key)


def _save_message(session_id: str, role: str, content: str) -> None:
    con = get_connection()
    con.execute(
        """
        INSERT INTO nelson_messages (message_id, session_id, role, content, created_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (f"MSG-{uuid.uuid4().hex[:12]}", session_id, role, content, datetime.utcnow()),
    )


def _load_history(session_id: str, limit: int = 20) -> list[dict]:
    con = get_connection()
    rows = con.execute(
        """
        SELECT role, content FROM nelson_messages
        WHERE session_id=?
        ORDER BY created_at DESC
        LIMIT ?
        """,
        (session_id, limit),
    ).fetchall()
    return [{"role": r[0], "content": r[1]} for r in reversed(rows)]


def _ensure_session(
    session_id: str | None, tenant_id: str, user_id: str, surface: str
) -> str:
    """Find or create a session. Returns the session_id."""
    con = get_connection()
    if session_id:
        row = con.execute(
            "SELECT session_id FROM nelson_sessions WHERE session_id=?",
            (session_id,),
        ).fetchone()
        if row:
            con.execute(
                "UPDATE nelson_sessions SET last_active_at=? WHERE session_id=?",
                (datetime.utcnow(), session_id),
            )
            return session_id

    new_id = session_id or f"SESS-{uuid.uuid4().hex[:12]}"
    now = datetime.utcnow()
    con.execute(
        """
        INSERT INTO nelson_sessions (session_id, tenant_id, user_id, surface, started_at, last_active_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (new_id, tenant_id, user_id, surface, now, now),
    )
    return new_id


def _history_to_contents(history: Iterable[dict]) -> list[types.Content]:
    contents: list[types.Content] = []
    for m in history:
        role = "user" if m["role"] == "user" else "model"
        contents.append(types.Content(role=role, parts=[types.Part.from_text(text=m["content"])]))
    return contents


def ask(
    user_message: str,
    *,
    tenant_id: str | None = None,
    user_id: str = "demo-user",
    surface: str = "cli",
    session_id: str | None = None,
    use_cache: bool = True,
) -> dict:
    """Ask Nelson something. Multi-step under the hood — returns the final text.

    Returns dict: {response, session_id, cached}.
    """
    tenant_id = tenant_id or settings.default_tenant_id
    session_id = _ensure_session(session_id, tenant_id, user_id, surface)
    history = _load_history(session_id)

    cache_key = {
        "model": settings.gemini_model,
        "tenant": tenant_id,
        "history": history,
        "user": user_message,
    }
    if use_cache:
        hit = cache.get(cache_key)
        if hit is not None:
            _save_message(session_id, "user", user_message)
            _save_message(session_id, "assistant", hit)
            return {"response": hit, "session_id": session_id, "cached": True}

    client = _client()
    tools = make_tools(tenant_id)
    config = types.GenerateContentConfig(
        system_instruction=system_prompt(settings.default_tenant_name),
        tools=tools,
        temperature=0.4,
        automatic_function_calling=types.AutomaticFunctionCallingConfig(
            maximum_remote_calls=10,
        ),
    )

    contents = _history_to_contents(history) + [
        types.Content(role="user", parts=[types.Part.from_text(text=user_message)])
    ]

    response = client.models.generate_content(
        model=settings.gemini_model,
        contents=contents,
        config=config,
    )
    text = (response.text or "").strip() or "(no response)"

    _save_message(session_id, "user", user_message)
    _save_message(session_id, "assistant", text)
    cache.put(cache_key, text)
    return {"response": text, "session_id": session_id, "cached": False}


def morning_brief(tenant_id: str | None = None, *, use_cache: bool = False) -> dict:
    return ask(
        morning_brief_prompt(settings.default_tenant_name),
        tenant_id=tenant_id,
        user_id="scheduler",
        surface="brief",
        use_cache=use_cache,
    )


# ---------- Streaming variant: yields tool calls + results live ----------

def _summarize_tool_result(name: str, result: Any) -> str:
    """One-line summary of a tool result for the streaming UI trace."""
    if not isinstance(result, (dict, list)):
        return str(result)[:80]

    if isinstance(result, list):
        if not result:
            return "0 items"
        first = result[0]
        if isinstance(first, dict):
            sample = first.get("name") or first.get("customer_full_name") or first.get("ticket_id")
            return f"{len(result)} items" + (f" (e.g. {sample})" if sample else "")
        return f"{len(result)} items"

    if "error" in result:
        return f"⚠️ {result['error']}"
    if "not_found" in result:
        return "not found in portfolio"
    if "not_found_exact" in result:
        n = len(result.get("suggestions", []))
        return f"no exact match — {n} similar suggestions"
    if "match" in result:
        m = result["match"]
        bits = [m.get("name") or m.get("customer_full_name") or "?"]
        if m.get("customer_id"):
            bits.append(f"({m['customer_id']})")
        if m.get("risk_band"):
            bits.append(f"· {m['risk_band']}")
        also = result.get("also_matched")
        suffix = f" + {len(also)} other matches" if also else ""
        return " ".join(bits) + suffix
    if "action_id" in result:
        return f"queued {result.get('type', 'action')} → {result['action_id']}"
    if "total_customers" in result:
        return (
            f"{result.get('total_customers', 0)} customers · "
            f"{result.get('critical_count', 0)} critical · "
            f"{result.get('high_count', 0)} high"
        )
    # Fallback: short JSON-ish preview
    return ", ".join(f"{k}={v}" for k, v in list(result.items())[:3])[:80]


async def stream_ask(
    user_message: str,
    *,
    tenant_id: str | None = None,
    user_id: str = "demo-user",
    surface: str = "dashboard",
    session_id: str | None = None,
) -> AsyncIterator[dict]:
    """Run Nelson's multi-step loop, yielding events as they happen.

    Event types:
      - {"type": "session", "session_id": str}     # immediately
      - {"type": "tool_call", "name": str, "args": dict}
      - {"type": "tool_result", "name": str, "summary": str}
      - {"type": "message", "content": str}        # final assistant text
      - {"type": "done", "session_id": str}
      - {"type": "error", "message": str}
    """
    tenant_id = tenant_id or settings.default_tenant_id
    session_id = _ensure_session(session_id, tenant_id, user_id, surface)
    yield {"type": "session", "session_id": session_id}

    if not settings.gemini_api_key:
        yield {
            "type": "error",
            "message": "GEMINI_API_KEY not set. Paste your key into nelson_ai/.env.",
        }
        return

    history = _load_history(session_id)
    client = _client()
    tools = make_tools(tenant_id)
    tool_map = {t.__name__: t for t in tools}

    # Manual function-calling loop: disable the SDK's automatic loop so we can
    # observe each step.
    config = types.GenerateContentConfig(
        system_instruction=system_prompt(settings.default_tenant_name),
        tools=tools,
        temperature=0.4,
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
    )

    contents: list[types.Content] = _history_to_contents(history) + [
        types.Content(role="user", parts=[types.Part.from_text(text=user_message)])
    ]

    final_text = ""
    max_steps = 10
    try:
        for _ in range(max_steps):
            response = await asyncio.to_thread(
                client.models.generate_content,
                model=settings.gemini_model,
                contents=contents,
                config=config,
            )
            candidate = response.candidates[0] if response.candidates else None
            if not candidate or not candidate.content or not candidate.content.parts:
                break

            function_calls = []
            text_chunks = []
            for part in candidate.content.parts:
                if getattr(part, "function_call", None):
                    function_calls.append(part.function_call)
                elif getattr(part, "text", None):
                    text_chunks.append(part.text)

            if text_chunks:
                final_text = "".join(text_chunks).strip()

            if not function_calls:
                # Loop done — final answer in final_text
                break

            # Append the model's tool-call turn to the running content
            contents.append(candidate.content)

            # Execute each tool call
            response_parts: list[types.Part] = []
            for fc in function_calls:
                args = dict(fc.args) if fc.args else {}
                yield {"type": "tool_call", "name": fc.name, "args": args}

                tool_fn = tool_map.get(fc.name)
                if tool_fn is None:
                    result: Any = {"error": f"Unknown tool: {fc.name}"}
                else:
                    try:
                        result = await asyncio.to_thread(tool_fn, **args)
                    except Exception as e:
                        result = {"error": f"{type(e).__name__}: {e}"}

                yield {
                    "type": "tool_result",
                    "name": fc.name,
                    "summary": _summarize_tool_result(fc.name, result),
                }

                # When Nelson drafts an action, surface it for inline rendering
                # in the chat widget so the user can approve/reject in place.
                if (
                    fc.name == "propose_action"
                    and isinstance(result, dict)
                    and result.get("action_id")
                ):
                    yield {
                        "type": "action_drafted",
                        "action_id": result["action_id"],
                        "customer_name": result.get("queued_for"),
                        "action_type": result.get("type"),
                    }

                # Gemini expects a Part with FunctionResponse
                response_parts.append(
                    types.Part.from_function_response(name=fc.name, response={"result": result})
                )

            contents.append(types.Content(role="user", parts=response_parts))
    except Exception as e:
        yield {"type": "error", "message": f"{type(e).__name__}: {e}"}
        return

    if not final_text:
        final_text = "(no response)"

    _save_message(session_id, "user", user_message)
    _save_message(session_id, "assistant", final_text)

    yield {"type": "message", "content": final_text}
    yield {"type": "done", "session_id": session_id}
