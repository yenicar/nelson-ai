"""Telegram surface for Nelson — long-polling, no framework.

Talks to Telegram via raw HTTP. Each Telegram user_id maps to its own Nelson
session, so memory and multi-turn context work naturally.

UX:
- Slash commands (/risk, /actions, etc.) route directly to the data layer
  for fast structured responses with inline buttons.
- Free-text questions go through Nelson's full agent loop.
- Inline buttons let the human approve/reject Nelson's drafts and drill into
  customers without typing.

Run with: bot starts automatically inside the API server (see api/app.py).
Requires TELEGRAM_BOT_TOKEN in .env. Optionally set TELEGRAM_ALLOWED_USER_IDS.
"""
from __future__ import annotations

import asyncio
import json
import sys
import uuid
from datetime import datetime

import httpx

from nelson.ai.agent import NelsonError, ask, morning_brief
from nelson.config.settings import settings
from nelson.data.db import get_connection
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
from nelson.services.actions import DecisionError, decide_action


WELCOME = (
    "*Hi, I'm Nelson — your AI Account Manager.*\n\n"
    "I watch your portfolio of 2,000 customers, surface risk, and draft actions "
    "for you to approve. I never send anything without your sign-off.\n\n"
    "*Three ways to use me*\n\n"
    "*1. Just type a customer name* — e.g. `Mary Brady` — and I'll send their "
    "card with action buttons (email, escalate, follow-up, credit, etc.).\n\n"
    "*2. Slash commands*\n"
    "/risk — top 10 at-risk customers\n"
    "/find Mary Brady — look up by name\n"
    "/actions — drafts awaiting your approval\n"
    "/brief — morning portfolio brief\n"
    "/help — full capabilities\n\n"
    "*3. Ask in plain English*\n"
    "_\"who's at risk this week?\"_\n"
    "_\"top 5 customers by revenue\"_\n"
    "_\"draft a service-recovery email for Frank Garcia\"_\n\n"
    "Every drafted action lands in `/actions` for you to *Approve*, ✏️ *Edit*, or *Reject*."
)

HELP_TEXT = (
    "*What Nelson can do*\n\n"
    "*Portfolio views*\n"
    "• Risk distribution across all 2,000 customers\n"
    "• Top-N by risk score (optionally filtered by band)\n"
    "• Top-N by revenue (highest or lowest)\n"
    "• Pending review follow-ups awaiting outcome\n\n"
    "*Customer drill-in (by name)*\n"
    "• Profile: revenue, profit, risk score, lifecycle stage\n"
    "• Recent orders, tickets, notes, email threads\n"
    "• Engagement and fulfillment events\n\n"
    "*Drafting actions for your approval*\n"
    "• Draft an email for you to send\n"
    "• Recommend proactive outreach\n"
    "• Recommend a credit / refund / order expedite\n"
    "• Reclassify risk band, update lifecycle stage\n"
    "• Escalate to leadership, schedule follow-up\n\n"
    "All drafted actions land in your *pending actions* queue. "
    "I never send, charge, or change anything without you tapping Approve."
)

# Slash commands shown in Telegram's "/" menu.
SLASH_COMMANDS = [
    {"command": "brief", "description": "Morning portfolio briefing"},
    {"command": "risk", "description": "Top 10 at-risk customers"},
    {"command": "find", "description": "Find a customer by name (e.g. /find Mary Brady)"},
    {"command": "actions", "description": "Actions awaiting your approval"},
    {"command": "pending", "description": "Pending review follow-ups"},
    {"command": "portfolio", "description": "Portfolio summary stats"},
    {"command": "help", "description": "Full capabilities"},
    {"command": "start", "description": "Restart this conversation"},
]

QUICK_COMMAND_PROMPTS: dict[str, str] = {
    "/risk": "Show me the top 10 at-risk customers in my portfolio. Include their names, customer IDs, risk score, and risk band.",
    "/portfolio": "Give me a concise portfolio summary — total customers, risk band distribution, total revenue, total profit, average risk and health scores.",
    "/pending": "List the customers with pending review follow-ups awaiting outcomes. Use their names.",
    "/actions": "List the actions you've drafted that are pending my approval, with the customer name, action type, and your rationale for each.",
}


# Each card-button click maps to a draft prompt + action_type tag.
# Nelson runs each prompt → calls propose_action with the right action_type.
DRAFT_PROMPTS: dict[str, dict[str, str]] = {
    "email": {
        "label": "outreach email",
        "prompt": (
            "Draft a customer-facing outreach email for {name} (customer_id={cid}). "
            "Pull recent tickets, notes, and emails to ground the message in their "
            "specific situation. Use propose_action with action_type 'send_email' and "
            "a payload_json with `to`, `subject`, and `body` fields. Keep the body "
            "under 200 words, professional but warm. Reply with a short confirmation "
            "and the action_id."
        ),
    },
    "esc": {
        "label": "escalation",
        "prompt": (
            "Draft an executive escalation recommendation for {name} (customer_id={cid}). "
            "Use propose_action with action_type 'escalate' and a payload_json explaining "
            "who to escalate to (e.g. CCO, VP Ops), the trigger event, and what action "
            "leadership should take. Reply with a short confirmation."
        ),
    },
    "note": {
        "label": "internal note",
        "prompt": (
            "Draft an internal review note for {name} (customer_id={cid}) summarizing "
            "current risk, key recent signals, and recommended next step. Use "
            "propose_action with action_type 'add_note' and a payload_json with a "
            "`text` field. Keep it under 150 words. Reply with a confirmation."
        ),
    },
    "fu": {
        "label": "follow-up",
        "prompt": (
            "Schedule a follow-up for {name} (customer_id={cid}). Use propose_action "
            "with action_type 'schedule_followup' and a payload_json with `when` "
            "(e.g. 'Friday afternoon'), `channel` (e.g. 'phone call', 'email'), and "
            "`agenda`. Pick the timing based on recent activity urgency. Reply with "
            "confirmation."
        ),
    },
    "cred": {
        "label": "credit",
        "prompt": (
            "Recommend a goodwill credit/refund for {name} (customer_id={cid}) if the "
            "evidence warrants. Use propose_action with action_type 'recommend_credit' "
            "and a payload_json with `amount`, `reason`, and `risk_offset` (what risk "
            "this is meant to mitigate). Reply with confirmation. If no clear basis "
            "exists, say so and don't propose."
        ),
    },
    "exp": {
        "label": "order expedite",
        "prompt": (
            "Recommend expediting any pending or late orders for {name} (customer_id={cid}). "
            "Use propose_action with action_type 'recommend_expedite' and a payload_json "
            "naming the specific order_id(s) and why expediting is justified. If no late "
            "orders exist, say so."
        ),
    },
    "band": {
        "label": "risk reclassification",
        "prompt": (
            "Recommend a risk-band reclassification for {name} (customer_id={cid}) if the "
            "evidence supports a change. Use propose_action with action_type "
            "'reclassify_band' and a payload_json with `current_band`, `proposed_band`, "
            "and `evidence`. Reply with confirmation."
        ),
    },
    "life": {
        "label": "lifecycle update",
        "prompt": (
            "Recommend a lifecycle stage update for {name} (customer_id={cid}). Use "
            "propose_action with action_type 'update_lifecycle' and a payload_json with "
            "`current_stage`, `new_stage`, and `trigger`. Reply with confirmation."
        ),
    },
    "out": {
        "label": "proactive outreach",
        "prompt": (
            "Recommend a proactive outreach plan for {name} (customer_id={cid}) — multi-touch, "
            "across channels. Use propose_action with action_type 'proactive_outreach' and a "
            "payload_json with `channels` (list), `cadence`, and `goal`. Reply with confirmation."
        ),
    },
}


# Per-user "edit mode" state: when a user taps Edit on a pending action,
# we remember the action_id and route their next text message as edit guidance.
_edit_contexts: dict[int, str] = {}


def _api_url(method: str) -> str:
    return f"https://api.telegram.org/bot{settings.telegram_bot_token}/{method}"


def _kb(rows: list[list[dict]]) -> dict:
    """Inline keyboard payload."""
    return {"inline_keyboard": rows}


async def _post_send(
    client: httpx.AsyncClient, body: dict
) -> tuple[bool, dict]:
    """POST to sendMessage and return (ok, response_json)."""
    try:
        r = await client.post(_api_url("sendMessage"), json=body)
        return r.json().get("ok", False), r.json()
    except Exception as e:
        return False, {"description": f"transport error: {type(e).__name__}: {e}"}


async def _send(
    client: httpx.AsyncClient,
    chat_id: int,
    text: str,
    *,
    reply_markup: dict | None = None,
) -> int | None:
    """Send a message with Markdown formatting; fall back to plain text on
    parse errors. Returns message_id (for the LAST chunk) on success.

    Telegram's Markdown parser is strict — unescaped underscores in customer
    IDs, unbalanced asterisks, stray backticks, etc. all return a 400. The
    fallback ensures the user always sees the content even if formatting fails.
    """
    last_id: int | None = None
    chunks = [text[i : i + 3900] for i in range(0, len(text), 3900)] or [text]
    for i, chunk in enumerate(chunks):
        body: dict = {"chat_id": chat_id, "text": chunk, "parse_mode": "Markdown"}
        if reply_markup and i == len(chunks) - 1:
            body["reply_markup"] = reply_markup

        ok, j = await _post_send(client, body)

        if not ok:
            desc = j.get("description", "unknown error")
            print(f"  [telegram] sendMessage failed (Markdown): {desc}")
            # Retry without parse_mode — content always wins over formatting.
            body.pop("parse_mode", None)
            ok, j = await _post_send(client, body)
            if not ok:
                print(f"  [telegram] sendMessage retry (plain) also failed: {j.get('description', j)}")
                continue
            else:
                print("  [telegram] plain-text fallback succeeded")

        if ok and "result" in j:
            last_id = j["result"]["message_id"]
    return last_id


async def _edit(
    client: httpx.AsyncClient,
    chat_id: int,
    message_id: int,
    text: str,
    *,
    reply_markup: dict | None = None,
) -> None:
    body: dict = {
        "chat_id": chat_id,
        "message_id": message_id,
        "text": text[:3900],
        "parse_mode": "Markdown",
    }
    if reply_markup is not None:
        body["reply_markup"] = reply_markup
    await client.post(_api_url("editMessageText"), json=body)


async def _answer_callback(
    client: httpx.AsyncClient, callback_id: str, text: str | None = None
) -> None:
    body: dict = {"callback_query_id": callback_id}
    if text:
        body["text"] = text
    await client.post(_api_url("answerCallbackQuery"), json=body)


async def _send_action(client: httpx.AsyncClient, chat_id: int, action: str = "typing") -> None:
    await client.post(_api_url("sendChatAction"), json={"chat_id": chat_id, "action": action})


# ---------- card formatters & direct handlers (no LLM) ----------

def _money(n) -> str:
    if n is None:
        return "—"
    if abs(n) >= 1_000_000:
        return f"${n/1_000_000:.1f}M"
    if abs(n) >= 1_000:
        return f"${n/1_000:.1f}k"
    return f"${n:.0f}"


def _band_emoji(band: str | None) -> str:
    b = (band or "").lower()
    if "critical" in b:
        return "🔴"
    if "high" in b:
        return "🟠"
    if "moderate" in b or "elevated" in b:
        return "🟡"
    if "low" in b:
        return "🟢"
    return "⚪"


async def _send_risk_list(client: httpx.AsyncClient, chat_id: int) -> None:
    accounts = AccountsRepo.top_at_risk(settings.default_tenant_id, limit=10)
    if not accounts:
        await _send(client, chat_id, "*No customers in this portfolio.*")
        return

    lines = ["*Top 10 at-risk customers*", ""]
    rows: list[list[dict]] = []
    for c in accounts:
        lines.append(
            f"{_band_emoji(c.risk_band)} *{c.customer_full_name}* — score {int(c.risk_score or 0)}"
        )
        rows.append(
            [{"text": f"View {c.customer_full_name}", "callback_data": f"v:{c.customer_id}"}]
        )

    await _send(client, chat_id, "\n".join(lines), reply_markup=_kb(rows))


async def _send_customer_card(
    client: httpx.AsyncClient, chat_id: int, customer_id: str
) -> None:
    c = AccountsRepo.get_by_id(settings.default_tenant_id, customer_id)
    if not c:
        await _send(client, chat_id, f"⚠️ Customer `{customer_id}` not found.")
        return

    open_tix = c.open_support_ticket_count or 0
    late_pct = int((c.late_delivery_rate or 0) * 100)

    text = (
        f"{_band_emoji(c.risk_band)} *{c.customer_full_name}*\n"
        f"`{c.customer_id}` · {c.customer_segment or '—'} · {c.customer_country or '—'}\n\n"
        f"*Risk* {c.risk_band or '—'} ({int(c.risk_score or 0)}/100)  ·  "
        f"*Health* {int(c.health_score or 0)}/100\n"
        f"*Revenue* {_money(c.total_sales)}  ·  *Profit* {_money(c.total_profit)}\n"
        f"*Late deliveries* {late_pct}%  ·  *Open tickets* {open_tix}\n"
        f"*Lifecycle* {c.lifecycle_stage or '—'}\n"
    )
    if c.churn_risk_reason:
        text += f"\n_Why on radar:_ {c.churn_risk_reason}"
    if c.next_best_action:
        text += f"\n_Next best action:_ {c.next_best_action}"
    text += "\n\n_Tap any button — Nelson drafts, you approve._"

    # All 9 action types Nelson can draft, plus a recent-activity drill-in.
    kb = _kb([
        [
            {"text": "✉️ Email", "callback_data": f"d:email:{customer_id}"},
            {"text": "📞 Outreach plan", "callback_data": f"d:out:{customer_id}"},
            {"text": "🚨 Escalate", "callback_data": f"d:esc:{customer_id}"},
        ],
        [
            {"text": "📝 Add note", "callback_data": f"d:note:{customer_id}"},
            {"text": "📅 Follow-up", "callback_data": f"d:fu:{customer_id}"},
            {"text": "🚚 Expedite", "callback_data": f"d:exp:{customer_id}"},
        ],
        [
            {"text": "💰 Credit", "callback_data": f"d:cred:{customer_id}"},
            {"text": "🎯 Reclassify", "callback_data": f"d:band:{customer_id}"},
            {"text": "🔄 Stage", "callback_data": f"d:life:{customer_id}"},
        ],
        [{"text": "📋 Recent activity", "callback_data": f"a:{customer_id}"}],
    ])
    await _send(client, chat_id, text, reply_markup=kb)


async def _send_disambiguation(
    client: httpx.AsyncClient, chat_id: int, query: str, candidates: list
) -> None:
    """When a name matches multiple customers, ask the user to pick one."""
    lines = [f"*Multiple customers match '{query}'.* Which one?", ""]
    rows: list[list[dict]] = []
    for c in candidates[:8]:
        lines.append(
            f"{_band_emoji(c.risk_band)} *{c.customer_full_name}* — "
            f"`{c.customer_id}` · {c.customer_country or '—'}"
        )
        rows.append([{"text": c.customer_full_name + f" ({c.customer_id})",
                      "callback_data": f"v:{c.customer_id}"}])
    await _send(client, chat_id, "\n".join(lines), reply_markup=_kb(rows))


async def _send_actions_list(client: httpx.AsyncClient, chat_id: int) -> None:
    actions = ActionsRepo.list_pending(settings.default_tenant_id, limit=10)
    if not actions:
        await _send(
            client,
            chat_id,
            "*No actions waiting on you.*\n_When I draft something, it'll appear here for approval._",
        )
        return

    await _send(client, chat_id, f"*{len(actions)} action{'s' if len(actions)!=1 else ''} awaiting approval*")
    for a in actions:
        await _send_action_card(client, chat_id, a)


async def _send_action_card(client: httpx.AsyncClient, chat_id: int, a) -> None:
    """One pending-action card with Approve / Edit / Reject buttons."""
    try:
        payload = json.loads(a.payload_json) if a.payload_json else {}
    except json.JSONDecodeError:
        payload = {}
    body_preview = (
        payload.get("body")
        or payload.get("subject")
        or payload.get("text")
        or payload.get("message")
        or ""
    )
    text = (
        f"*{a.customer_full_name or '—'}*\n"
        f"`{a.action_type.replace('_', ' ')}` · confidence {int((a.confidence or 0)*100)}%\n"
    )
    if a.nelson_rationale:
        text += f"\n_{a.nelson_rationale}_\n"
    if body_preview:
        preview = body_preview[:300] + ("…" if len(body_preview) > 300 else "")
        text += f"\n```\n{preview}\n```"
    kb = _kb([
        [
            {"text": "✓ Approve", "callback_data": f"act:appr:{a.action_id}"},
            {"text": "✏️ Edit", "callback_data": f"act:edit:{a.action_id}"},
            {"text": "✗ Reject", "callback_data": f"act:rej:{a.action_id}"},
        ],
        [{"text": "View customer", "callback_data": f"v:{a.customer_id}"}],
    ])
    await _send(client, chat_id, text, reply_markup=kb)


_NAME_STARTERS_TO_SKIP = {
    "what", "who", "show", "tell", "draft", "list", "find", "give", "is",
    "are", "can", "could", "would", "do", "does", "how", "why", "when",
    "where", "the", "my", "our", "any", "all", "yes", "no", "ok", "okay",
    "sure", "thanks", "hi", "hello", "hey",
}


def _looks_like_customer_name(text: str) -> bool:
    """Heuristic: does this look like the user typed a customer's name?"""
    t = text.strip()
    if not t or t.startswith("/") or "?" in t or len(t) < 3:
        return False
    words = t.split()
    if len(words) < 1 or len(words) > 4:
        return False
    if words[0].lower() in _NAME_STARTERS_TO_SKIP:
        return False
    # Most words should start with a capital (allow common particles).
    particles = {"de", "la", "le", "von", "van", "der", "den", "of", "the"}
    capitalized = sum(1 for w in words if w[:1].isupper() or w.lower() in particles)
    return capitalized >= max(1, len(words) - 1)


async def _route_customer_lookup(
    client: httpx.AsyncClient,
    chat_id: int,
    query: str,
    *,
    fallback_to_agent: bool = False,
) -> bool:
    """Try direct name → customer card. Returns True if we handled it.

    fallback_to_agent=True: silent return False on no match (so the caller can
    pass the message to Nelson). False: send a "not found" message.
    """
    tenant = settings.default_tenant_id
    exact = AccountsRepo.get_by_name(tenant, query)
    if exact:
        await _send_customer_card(client, chat_id, exact.customer_id)
        return True

    # Fuzzy match
    candidates = AccountsRepo.search(tenant, query, limit=8)
    if len(candidates) == 1:
        await _send_customer_card(client, chat_id, candidates[0].customer_id)
        return True
    if len(candidates) > 1:
        await _send_disambiguation(client, chat_id, query, candidates)
        return True

    # Last-name fallback
    parts = query.split()
    if len(parts) >= 2:
        ln = AccountsRepo.search(tenant, parts[-1], limit=8)
        if ln:
            await _send_disambiguation(client, chat_id, query, ln)
            return True

    if not fallback_to_agent:
        await _send(
            client,
            chat_id,
            f"*'{query}'* isn't in your portfolio of 2,000 customers. "
            f"Check the spelling or try `/risk` to see who is.",
        )
    return False


async def _regenerate_action(
    client: httpx.AsyncClient,
    chat_id: int,
    user_id: int,
    action_id: str,
    guidance: str,
    sessions: dict[int, str],
) -> None:
    """User tapped Edit and replied with guidance. Reject the old draft and
    ask Nelson to draft a new one incorporating the feedback."""
    con = get_connection()
    row = con.execute(
        """
        SELECT customer_id, customer_full_name, action_type, payload_json,
               nelson_rationale
        FROM pending_actions
        WHERE action_id=? AND tenant_id=?
        """,
        (action_id, settings.default_tenant_id),
    ).fetchone()
    if not row:
        await _send(client, chat_id, "⚠️ That draft no longer exists.")
        return

    customer_id, customer_name, action_type, old_payload, old_rationale = row

    # Mark the old draft as superseded.
    ActionsRepo.decide(action_id, "rejected", str(user_id), datetime.utcnow())

    prompt = (
        f"REVISE a previously drafted {action_type} for {customer_name} "
        f"(customer_id={customer_id}). The user wants you to change it based on "
        f"this feedback: \"{guidance}\".\n\n"
        f"Original draft payload: {old_payload}\n"
        f"Original rationale: {old_rationale}\n\n"
        f"Use propose_action to create a NEW draft with action_type "
        f"'{action_type}' that incorporates the user's feedback. Reply with a "
        f"short confirmation that the revised draft is queued, plus the new "
        f"action_id."
    )

    try:
        result = await asyncio.to_thread(
            ask,
            prompt,
            user_id=str(user_id),
            surface="telegram",
            session_id=sessions.get(user_id),
            use_cache=False,
        )
        sessions[user_id] = result["session_id"]
        await _send(client, chat_id, f"✏️ *Revised draft queued.*\n\n{result['response']}")

        # Also surface the new action card if it was created.
        latest = ActionsRepo.list_pending(settings.default_tenant_id, limit=1)
        if latest and latest[0].customer_id == customer_id:
            await _send_action_card(client, chat_id, latest[0])
    except NelsonError as e:
        await _send(client, chat_id, f"⚠️ {e}")
    except Exception as e:
        await _send(client, chat_id, f"⚠️ Revision failed: {type(e).__name__}: {e}")


async def _send_recent_activity(
    client: httpx.AsyncClient, chat_id: int, customer_id: str
) -> None:
    tenant = settings.default_tenant_id
    c = AccountsRepo.get_by_id(tenant, customer_id)
    if not c:
        await _send(client, chat_id, f"⚠️ Customer `{customer_id}` not found.")
        return

    orders = OrdersRepo.recent(tenant, customer_id, 3)
    tickets = TicketsRepo.recent(tenant, customer_id, 3)
    notes = NotesRepo.recent(tenant, customer_id, 3)
    emails = EmailsRepo.recent(tenant, customer_id, 3)
    fulfillment = EventsRepo.fulfillment(tenant, customer_id, 3)

    lines = [f"*Recent activity — {c.customer_full_name}*", ""]
    if tickets:
        lines.append("*Tickets*")
        for t in tickets:
            lines.append(
                f"  • `{t.ticket_id}` {t.ticket_subject or '—'} ({t.ticket_priority or '?'} · {t.ticket_status or '?'})"
            )
        lines.append("")
    if orders:
        lines.append("*Orders*")
        for o in orders:
            lines.append(
                f"  • `{o.order_id}` {o.order_date} · {o.delivery_status or '?'} · {_money(o.order_sales)}"
            )
        lines.append("")
    if notes:
        lines.append("*Notes*")
        for n in notes:
            preview = (n.note_text or "")[:80].replace("\n", " ")
            lines.append(f"  • _{n.note_date}_ {preview}")
        lines.append("")
    if emails:
        lines.append("*Emails*")
        for e in emails:
            subj = (e.subject or "")[:60]
            lines.append(f"  • _{e.date}_ {e.direction or '?'} · {subj}")
        lines.append("")
    if fulfillment:
        lines.append("*Fulfillment events*")
        for f in fulfillment:
            lines.append(
                f"  • _{f.event_date}_ {f.event_type} · {f.severity or '?'} · {f.resolution_status or '?'}"
            )

    if len(lines) == 2:
        lines.append("_No recent activity._")

    kb = _kb([[{"text": "← Back to customer", "callback_data": f"v:{customer_id}"}]])
    await _send(client, chat_id, "\n".join(lines), reply_markup=kb)


# ---------- callback handler ----------

async def _handle_callback(
    client: httpx.AsyncClient,
    callback: dict,
    sessions: dict[int, str],
    allowed: set[int],
) -> None:
    user_id = callback.get("from", {}).get("id")
    callback_id = callback.get("id")
    data = callback.get("data", "") or ""
    msg = callback.get("message", {}) or {}
    chat_id = msg.get("chat", {}).get("id")
    message_id = msg.get("message_id")

    if not callback_id or not chat_id:
        return
    if allowed and user_id not in allowed:
        await _answer_callback(client, callback_id, "Not authorized")
        return

    print(f"  [telegram] callback chat={chat_id} data={data!r}")
    parts = data.split(":")
    kind = parts[0] if parts else ""

    try:
        # ---- View customer card ----
        if kind == "v" and len(parts) >= 2:
            await _answer_callback(client, callback_id)
            await _send_customer_card(client, chat_id, parts[1])
            return

        # ---- Recent activity ----
        if kind == "a" and len(parts) >= 2:
            await _answer_callback(client, callback_id)
            await _send_recent_activity(client, chat_id, parts[1])
            return

        # ---- Approve / reject / edit a pending action ----
        if kind == "act" and len(parts) >= 3:
            verb, action_id = parts[1], parts[2]
            con = get_connection()
            row = con.execute(
                "SELECT customer_id, customer_full_name, status FROM pending_actions WHERE action_id=? AND tenant_id=?",
                (action_id, settings.default_tenant_id),
            ).fetchone()
            if not row:
                await _answer_callback(client, callback_id, "Action not found")
                return
            if row[2] != "pending":
                await _answer_callback(client, callback_id, f"Already {row[2]}")
                return

            if verb == "edit":
                _edit_contexts[user_id] = action_id
                await _answer_callback(client, callback_id, "Edit mode")
                await _send(
                    client,
                    chat_id,
                    f"✏️ *Edit mode for `{action_id}`*\n\n"
                    "Reply with a short instruction. Examples:\n"
                    "• _\"Make it shorter and more apologetic\"_\n"
                    "• _\"Mention we're crediting their next order\"_\n"
                    "• _\"Move the follow-up to next Tuesday\"_\n\n"
                    "Or send anything else to cancel.",
                )
                return

            new_status = "approved" if verb == "appr" else "rejected"
            try:
                result = decide_action(
                    tenant_id=settings.default_tenant_id,
                    user_id=str(user_id),
                    action_id=action_id,
                    status_value=new_status,
                )
            except DecisionError as e:
                await _answer_callback(client, callback_id, "Not found")
                await _send(client, chat_id, f"⚠️ {e}")
                return

            # Build the toast + card update based on whether email actually sent.
            if new_status == "approved" and result.get("sent"):
                ack = f"📧 Sent to {result.get('sent_to')}"
                marker = f"📧 SENT to {result.get('sent_to')}"
                follow_up = f"📧 *Email sent* to `{result.get('sent_to')}`"
            elif new_status == "approved" and result.get("send_error"):
                ack = "✓ Approved (not sent)"
                marker = "✓ APPROVED · not sent"
                follow_up = (
                    f"✓ *Approved* — but the email was not sent.\n\n"
                    f"_{result.get('send_error')}_"
                )
            else:
                ack = "✓ Approved" if verb == "appr" else "✗ Rejected"
                marker = "✓ APPROVED" if verb == "appr" else "✗ REJECTED"
                follow_up = None

            await _answer_callback(client, callback_id, ack)
            if message_id and msg.get("text"):
                old_text = msg["text"]
                await _edit(client, chat_id, message_id, f"{marker}\n\n{old_text}", reply_markup=None)
            if follow_up:
                await _send(client, chat_id, follow_up)
            return

        # ---- Trigger Nelson to draft an action for a customer ----
        if kind == "d" and len(parts) >= 3:
            verb, customer_id = parts[1], parts[2]
            c = AccountsRepo.get_by_id(settings.default_tenant_id, customer_id)
            if not c:
                await _answer_callback(client, callback_id, "Customer not found")
                return
            spec = DRAFT_PROMPTS.get(verb)
            if not spec:
                await _answer_callback(client, callback_id, "Unknown action")
                return

            await _answer_callback(client, callback_id, f"Drafting {spec['label']}…")
            await _send_action(client, chat_id, "typing")
            prompt = spec["prompt"].format(name=c.customer_full_name, cid=c.customer_id)
            try:
                result = await asyncio.to_thread(
                    ask,
                    prompt,
                    user_id=str(user_id),
                    surface="telegram",
                    session_id=sessions.get(user_id),
                    use_cache=False,
                )
                sessions[user_id] = result["session_id"]
                await _send(client, chat_id, result["response"])
                # Surface the freshly drafted action card so the user can
                # immediately approve/edit/reject it.
                latest = ActionsRepo.list_pending(settings.default_tenant_id, limit=1)
                if latest and latest[0].customer_id == customer_id:
                    await _send_action_card(client, chat_id, latest[0])
            except NelsonError as e:
                await _send(client, chat_id, f"⚠️ {e}")
            except Exception as e:
                await _send(client, chat_id, f"⚠️ Drafting failed: {type(e).__name__}: {e}")
            return

        await _answer_callback(client, callback_id, "Unknown action")
    except Exception as e:
        print(f"  [telegram] callback error: {type(e).__name__}: {e}")
        try:
            await _answer_callback(client, callback_id, "Error")
        except Exception:
            pass


async def _handle_message(
    client: httpx.AsyncClient,
    msg: dict,
    sessions: dict[int, str],
    allowed: set[int],
) -> None:
    """Top-level safe handler — guaranteed to send *something* back to the user."""
    chat_id = msg.get("chat", {}).get("id")
    if not chat_id:
        return
    try:
        await _do_handle(client, msg, sessions, allowed)
    except NelsonError as e:
        print(f"  [telegram] NelsonError chat={chat_id}: {e}")
        try:
            await _send(client, chat_id, f"⚠️ {e}")
        except Exception:
            pass
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print(f"  [telegram] unhandled error chat={chat_id}: {type(e).__name__}: {e}")
        print(tb)
        try:
            await _send(client, chat_id, f"⚠️ Nelson hit an error: {type(e).__name__}: {e}")
        except Exception:
            pass


async def _do_handle(
    client: httpx.AsyncClient,
    msg: dict,
    sessions: dict[int, str],
    allowed: set[int],
) -> None:
    user_id = msg["from"]["id"]
    chat_id = msg["chat"]["id"]
    text = msg.get("text", "").strip()
    if not text:
        return

    if allowed and user_id not in allowed:
        await _send(client, chat_id, "Sorry — you're not on the allow-list for Nelson yet.")
        return

    if text == "/start":
        await _send(client, chat_id, WELCOME)
        return
    if text == "/help":
        await _send(client, chat_id, HELP_TEXT)
        return

    print(f"  [telegram] chat={chat_id} user={user_id}: {text!r}")

    # Direct DB-backed slash commands — fast, structured, button-laden, no LLM.
    if text == "/risk":
        await _send_action(client, chat_id, "typing")
        await _send_risk_list(client, chat_id)
        return
    if text == "/actions":
        await _send_action(client, chat_id, "typing")
        await _send_actions_list(client, chat_id)
        return
    if text.startswith("/find"):
        await _send_action(client, chat_id, "typing")
        query = text[5:].strip()
        if not query:
            await _send(client, chat_id, "*Usage:* `/find <name>`\n_e.g._ `/find Mary Brady`")
            return
        await _route_customer_lookup(client, chat_id, query)
        return

    # Edit-mode capture: user previously tapped ✏️ Edit on an action card.
    # Their next text message is the edit guidance.
    if user_id in _edit_contexts:
        action_id = _edit_contexts.pop(user_id)
        await _send_action(client, chat_id, "typing")
        await _regenerate_action(client, chat_id, user_id, action_id, text, sessions)
        return

    # Auto-detect: did the user just type a customer name? Skip the LLM and
    # send the customer card directly. Falls through to the agent if the
    # message doesn't look like a name or no match exists.
    if _looks_like_customer_name(text):
        if await _route_customer_lookup(client, chat_id, text, fallback_to_agent=True):
            return

    await _send_action(client, chat_id, "typing")

    if text == "/brief":
        result = await asyncio.to_thread(morning_brief)
    elif text in QUICK_COMMAND_PROMPTS:
        # Translate the slash command into a natural-language prompt for Nelson.
        result = await asyncio.to_thread(
            ask,
            QUICK_COMMAND_PROMPTS[text],
            user_id=str(user_id),
            surface="telegram",
            session_id=sessions.get(user_id),
            use_cache=False,
        )
        sessions[user_id] = result["session_id"]
    else:
        result = await asyncio.to_thread(
            ask,
            text,
            user_id=str(user_id),
            surface="telegram",
            session_id=sessions.get(user_id),
            use_cache=False,
        )
        sessions[user_id] = result["session_id"]
    msg_id = await _send(client, chat_id, result["response"])
    if msg_id:
        print(f"  [telegram] replied to chat={chat_id} ({len(result['response'])} chars) message_id={msg_id}")
    else:
        print(f"  [telegram] reply NOT DELIVERED to chat={chat_id} (sendMessage failed both Markdown + plain)")


async def _run() -> None:
    if not settings.telegram_bot_token:
        print("  [telegram] TELEGRAM_BOT_TOKEN not set in .env", file=sys.stderr)
        sys.exit(1)

    allowed = set(settings.telegram_user_ids)
    sessions: dict[int, str] = {}
    offset = 0

    async with httpx.AsyncClient(timeout=35.0) as client:
        # Verify bot identity
        me_resp = await client.get(_api_url("getMe"))
        me_payload = me_resp.json()
        if not me_payload.get("ok"):
            print(f"  [telegram] getMe failed: {me_payload}")
            return
        me = me_payload.get("result", {})
        bot_name = me.get("username", "?")
        print(f"  [telegram] online as @{bot_name}")

        # If a webhook was previously set, polling is silently disabled.
        # Drop any webhook so getUpdates works.
        try:
            await client.post(_api_url("deleteWebhook"), json={"drop_pending_updates": False})
            print("  [telegram] webhook cleared (using long-polling)")
        except Exception as e:
            print(f"  [telegram] deleteWebhook warn: {e}")

        # Register the slash command menu so users see "/" → command list.
        try:
            r = await client.post(_api_url("setMyCommands"), json={"commands": SLASH_COMMANDS})
            if r.json().get("ok"):
                print(f"  [telegram] slash menu registered ({len(SLASH_COMMANDS)} commands)")
            else:
                print(f"  [telegram] setMyCommands warn: {r.json()}")
        except Exception as e:
            print(f"  [telegram] setMyCommands warn: {e}")

        if allowed:
            print(f"  [telegram] allow-list: {sorted(allowed)}")
        else:
            print("  [telegram] allow-list empty — all users accepted (set TELEGRAM_ALLOWED_USER_IDS to restrict)")

        while True:
            try:
                resp = await client.get(
                    _api_url("getUpdates"),
                    params={
                        "offset": offset,
                        "timeout": 25,
                        "allowed_updates": '["message","callback_query"]',
                    },
                )
                updates = resp.json().get("result", [])
            except asyncio.CancelledError:
                raise  # propagate so the task actually stops on shutdown
            except httpx.HTTPError as e:
                print(f"  [telegram] poll error: {type(e).__name__}: {e}")
                await asyncio.sleep(2)
                continue

            for u in updates:
                offset = u["update_id"] + 1
                msg = u.get("message")
                cb = u.get("callback_query")
                if msg:
                    task = asyncio.create_task(_handle_message(client, msg, sessions, allowed))
                    task.add_done_callback(_log_task_error)
                elif cb:
                    task = asyncio.create_task(_handle_callback(client, cb, sessions, allowed))
                    task.add_done_callback(_log_task_error)


def _log_task_error(task: asyncio.Task) -> None:
    if task.cancelled():
        return
    exc = task.exception()
    if exc:
        print(f"  [telegram] task crashed: {type(exc).__name__}: {exc}")


def run() -> int:
    try:
        asyncio.run(_run())
    except KeyboardInterrupt:
        print("\n  [telegram] stopped")
    return 0
