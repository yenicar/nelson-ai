"""Settings loaded from `.env` (project root).

Single source of truth for env-driven config. Import `settings` anywhere.
"""
from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # Gemini (Nelson's brain)
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"

    # Telegram (second surface)
    telegram_bot_token: str = ""
    telegram_allowed_user_ids: str = ""

    # App
    app_env: str = "development"
    app_host: str = "127.0.0.1"
    app_port: int = 8000
    frontend_origin: str = "http://127.0.0.1:3000"

    # Auth (developer login for v1)
    dev_login_email: str = "demo@nelson.ai"
    dev_login_password: str = "demo"
    session_secret: str = "change-me"

    # Data
    duckdb_path: Path = ROOT / "backend" / "nelson.duckdb"
    customer_data_dir: Path = ROOT / "data" / "customer_2000"

    # Tenant (multi-tenant from day one)
    default_tenant_id: str = "demo-tenant"
    default_tenant_name: str = "Acme Manufacturing"

    @property
    def telegram_user_ids(self) -> list[int]:
        raw = self.telegram_allowed_user_ids or ""
        # Strip any inline comment from the .env value
        if "#" in raw:
            raw = raw.split("#", 1)[0]
        ids: list[int] = []
        for token in raw.split(","):
            token = token.strip()
            if token.isdigit():
                ids.append(int(token))
        return ids


settings = Settings()
