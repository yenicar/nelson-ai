"""DuckDB connection helper.

Single shared connection. DuckDB handles concurrent reads internally; writes
serialize on the connection's lock, which is fine for our scale.
"""
from __future__ import annotations

import duckdb

from nelson.config.settings import settings

_con: duckdb.DuckDBPyConnection | None = None


def get_connection() -> duckdb.DuckDBPyConnection:
    """Return the shared DuckDB connection, opening it on first call."""
    global _con
    if _con is None:
        settings.duckdb_path.parent.mkdir(parents=True, exist_ok=True)
        _con = duckdb.connect(str(settings.duckdb_path))
    return _con


def close_connection() -> None:
    """Close the shared connection. Call on app shutdown."""
    global _con
    if _con is not None:
        _con.close()
        _con = None


def reset_connection() -> None:
    """Force-reopen on next get_connection(). Used after a rebuild."""
    close_connection()
