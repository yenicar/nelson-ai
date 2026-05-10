"""Nelson CLI — `python -m nelson.cli <command>`.

Commands:
    build-data            Rebuild nelson.duckdb from customer_2000 CSVs.
    smoke                 Quick read-test of the data layer (3 sample queries).
    ask <question>        Ask Nelson something. Requires GEMINI_API_KEY in .env.
    brief                 Generate a morning brief.
    serve                 Run the FastAPI backend (uvicorn).
                          Also runs the Telegram bot in-process if
                          TELEGRAM_BOT_TOKEN is set in .env.
    eval [limit] [seed]   Run holdout eval (Nelson vs human_decision labels).
                          Defaults: limit=30, seed=42. Output -> eval/reports/.
"""
from __future__ import annotations

import sys

from nelson.config.settings import settings
from nelson.data.build import build
from nelson.data.repositories import AccountsRepo, EventsRepo, NotesRepo


def smoke() -> int:
    tenant = settings.default_tenant_id
    summary = AccountsRepo.portfolio_summary(tenant)
    if not summary:
        print("  [smoke] no portfolio summary — did you run build-data?", file=sys.stderr)
        return 1
    print(f"  [smoke] portfolio: {summary['total_customers']} customers")
    print(f"          critical={summary.get('critical_count', 0)} "
          f"high={summary.get('high_count', 0)} "
          f"mod={summary.get('moderate_count', 0)} "
          f"low={summary.get('low_count', 0)}")

    top = AccountsRepo.top_at_risk(tenant, limit=3)
    print(f"  [smoke] top 3 at risk:")
    for c in top:
        print(f"          {c.customer_full_name:<30} band={c.risk_band:<10} score={c.risk_score}")

    if top:
        c = top[0]
        notes = NotesRepo.recent(tenant, c.customer_id, limit=2)
        events = EventsRepo.fulfillment(tenant, c.customer_id, limit=2)
        print(f"  [smoke] {c.customer_full_name}: {len(notes)} recent notes, {len(events)} fulfillment events")

    return 0


def ask_cmd(question: str) -> int:
    from nelson.ai.agent import NelsonError, ask
    try:
        result = ask(question, use_cache=False)
    except NelsonError as e:
        print(f"  [ask] {e}", file=sys.stderr)
        return 1
    print(result["response"])
    print(f"\n  [session: {result['session_id']}, cached={result['cached']}]")
    return 0


def brief_cmd() -> int:
    from nelson.ai.agent import NelsonError, morning_brief
    try:
        result = morning_brief()
    except NelsonError as e:
        print(f"  [brief] {e}", file=sys.stderr)
        return 1
    print(result["response"])
    return 0


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    cmd = sys.argv[1]
    if cmd == "build-data":
        return build()
    if cmd == "smoke":
        return smoke()
    if cmd == "ask":
        if len(sys.argv) < 3:
            print("  [error] usage: ask <question>", file=sys.stderr)
            return 1
        return ask_cmd(" ".join(sys.argv[2:]))
    if cmd == "brief":
        return brief_cmd()
    if cmd == "serve":
        import uvicorn
        uvicorn.run(
            "nelson.api.app:app",
            host=settings.app_host,
            port=settings.app_port,
            reload=False,
        )
        return 0
    if cmd == "telegram":
        print(
            "  [cli] Telegram now runs inside `serve`. Just start the API server\n"
            "        and the bot will start automatically if TELEGRAM_BOT_TOKEN is set.",
            file=sys.stderr,
        )
        return 1
    if cmd == "eval":
        from nelson.eval import run as run_eval
        limit = int(sys.argv[2]) if len(sys.argv) > 2 else 30
        seed = int(sys.argv[3]) if len(sys.argv) > 3 else 42
        return run_eval(limit=limit, seed=seed)
    print(f"  [error] unknown command: {cmd}", file=sys.stderr)
    print(__doc__)
    return 1


if __name__ == "__main__":
    sys.exit(main())
