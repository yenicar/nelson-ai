"""DuckDB connection helper.

Single shared connection. DuckDB handles concurrent reads internally; writes
serialize on the connection's lock, which is fine for our scale.

Lightweight schema migrations are applied automatically the first time any
code opens the connection — so adding new columns ships with the code, no
build-data step required.
"""
from __future__ import annotations

import duckdb

from nelson.config.settings import settings

_con: duckdb.DuckDBPyConnection | None = None
_migrated: bool = False

# Schema migrations are idempotent ALTER statements. They're tried in order
# every time the connection opens; if a column or table already exists, the
# statement is silently skipped. This is safe because:
#   - DuckDB supports `ADD COLUMN IF NOT EXISTS` (no error on retry).
#   - The set is small (we apply per-startup, not per-query).
#   - On a fresh DB, build.py creates these tables with the right columns
#     already, so the ALTERs are no-ops.
_MIGRATIONS: list[str] = [
    # 2026-05-11: track Gmail SMTP send outcome for send_email actions.
    "ALTER TABLE pending_actions ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP",
    "ALTER TABLE pending_actions ADD COLUMN IF NOT EXISTS send_error VARCHAR",
]


def _apply_migrations(con: duckdb.DuckDBPyConnection) -> None:
    for ddl in _MIGRATIONS:
        try:
            con.execute(ddl)
        except duckdb.CatalogException:
            # Table doesn't exist yet — fresh DB, build will create it correctly.
            pass
        except Exception as e:
            # Older DuckDB without `IF NOT EXISTS` syntax — column probably exists.
            if "already exists" not in str(e).lower():
                print(f"  [migration] warn: {ddl!r} -> {type(e).__name__}: {e}")


def get_connection() -> duckdb.DuckDBPyConnection:
    """Return the shared DuckDB connection, opening it on first call."""
    global _con, _migrated
    if _con is None:
        settings.duckdb_path.parent.mkdir(parents=True, exist_ok=True)
        _con = duckdb.connect(str(settings.duckdb_path))
    if not _migrated:
        _apply_migrations(_con)
        _migrated = True
    return _con


def close_connection() -> None:
    """Close the shared connection. Call on app shutdown."""
    global _con, _migrated
    if _con is not None:
        _con.close()
        _con = None
        _migrated = False


def reset_connection() -> None:
    """Force-reopen on next get_connection(). Used after a rebuild."""
    close_connection()
