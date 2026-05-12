"""FastAPI application factory."""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from nelson.api.routes import accounts, actions, auth, chat, health, portfolio
from nelson.config.settings import settings
from nelson.data.db import close_connection, get_connection


def _apply_runtime_migrations() -> None:
    """Add columns/tables that newer code expects but older DBs may lack.
    Idempotent — safe to run on every startup."""
    con = get_connection()
    for ddl in [
        "ALTER TABLE pending_actions ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP",
        "ALTER TABLE pending_actions ADD COLUMN IF NOT EXISTS send_error VARCHAR",
    ]:
        try:
            con.execute(ddl)
        except Exception as e:
            # Column may already exist on older DuckDB (no IF NOT EXISTS support).
            if "already exists" not in str(e).lower():
                print(f"  [migration] warn: {ddl} -> {type(e).__name__}: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # warm the DuckDB connection at startup
    get_connection()
    _apply_runtime_migrations()

    # If a Telegram token is set, run the bot in-process (DuckDB allows only
    # one writer per file, so we co-locate both surfaces in one process).
    telegram_task: asyncio.Task | None = None
    if settings.telegram_bot_token:
        from nelson.ai.telegram_bot import _run as telegram_main

        def _on_telegram_done(t: asyncio.Task) -> None:
            if t.cancelled():
                return
            exc = t.exception()
            if exc:
                print(f"  [app] Telegram bot crashed: {type(exc).__name__}: {exc}")

        telegram_task = asyncio.create_task(telegram_main(), name="nelson-telegram")
        telegram_task.add_done_callback(_on_telegram_done)
        print("  [app] Telegram bot started (in-process)")

    yield

    if telegram_task and not telegram_task.done():
        telegram_task.cancel()
        try:
            await telegram_task
        except asyncio.CancelledError:
            pass
    close_connection()


app = FastAPI(
    title="Nelson AI",
    description="Account intelligence backend for Nelson the AI Account Manager.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(portfolio.router)
app.include_router(accounts.router)
app.include_router(chat.router)
app.include_router(actions.router)


@app.get("/")
def root() -> dict:
    return {"name": "Nelson AI", "version": "0.1.0", "docs": "/docs"}
