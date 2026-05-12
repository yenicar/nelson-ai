"""FastAPI application factory."""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from nelson.api.routes import accounts, actions, auth, chat, health, portfolio
from nelson.config.settings import settings
from nelson.data.db import close_connection, get_connection


@asynccontextmanager
async def lifespan(app: FastAPI):
    # warm the DuckDB connection at startup (this also applies migrations)
    get_connection()

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
