"""Disk cache for Gemini responses keyed by input hash.

For deterministic re-runs (demo, eval). Skipped when the cache key changes
(different prompt, different model, different tools).
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from nelson.config.settings import ROOT

CACHE_DIR = ROOT / "backend" / "cache" / "agent"


def _key(payload: dict) -> str:
    blob = json.dumps(payload, sort_keys=True, default=str).encode("utf-8")
    return hashlib.sha256(blob).hexdigest()[:24]


def get(payload: dict) -> str | None:
    """Return cached response text or None."""
    p = CACHE_DIR / f"{_key(payload)}.json"
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))["response"]
    except Exception:
        return None


def put(payload: dict, response: str) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    p = CACHE_DIR / f"{_key(payload)}.json"
    p.write_text(
        json.dumps({"response": response}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
