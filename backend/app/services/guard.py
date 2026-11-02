"""Cost protection for the public demo.

The hosted demo is deliberately keyless for judges, so anyone with the URL can
reach the model-calling endpoints. Two layers stop a loop from draining the
Muse credits:

1. **Per-identity rate limits** (in-process): a burst/minute and an hourly cap
   keyed by the bearer token (hashed) or the caller IP. Two Modal containers
   each keep their own window; the shared daily budget is the backstop.
2. **A durable daily budget** (`model_usage` table): every model-calling
   request reserves weighted units before the handler runs. When the day's
   budget is exhausted the endpoint returns 429 — the deterministic fallback
   still works, but no further paid model call is made.

This is intentionally request-level, not token-level: an ingest of 40 files is
weighted heavier than a single parse, so a bot cannot hide a large batch behind
one cheap-looking request. Sizes are capped in the endpoints as well.
"""

from __future__ import annotations

import contextvars
import hashlib
import os
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timezone

from fastapi import Request

from app.db import SessionLocal
from app.models.guard import ModelUsage

ENABLED = os.getenv("DEMO_GUARD_ENABLED", "1").lower() not in ("0", "false", "no")
DAILY_BUDGET = max(1, int(os.getenv("DEMO_DAILY_MODEL_BUDGET", "300")))
PER_HOUR = max(1, int(os.getenv("DEMO_MODEL_CALLS_PER_HOUR", "60")))
PER_MINUTE = max(1, int(os.getenv("DEMO_MODEL_CALLS_PER_MINUTE", "8")))

# Weighted units per model-calling route. Ingest can fan out into several
# batched Muse calls; audio/transcript are expensive; parse/explain are one.
_WEIGHTS: dict[str, int] = {
    "/ingest": 5,
    "/ingest/files": 8,
    "/ingest/apply": 1,
    "/parse": 2,
    "/copilot": 2,
    "/term-change": 2,
    "/student/plan": 2,
    "/intelligence/tighten": 2,
    "/runtime/test": 2,
    "/term-change/audio": 6,
    "/student/transcript": 4,
}

_lock = threading.Lock()
_hits: dict[str, deque[float]] = defaultdict(deque)
_memory_day: str | None = None
_memory_used = 0
_exhausted_day: str | None = None
_degraded = contextvars.ContextVar("demo_model_degraded", default=False)


def model_allowed() -> bool:
    """False means: serve the deterministic fallback, do not call the model.

    Set for the rest of the day when the shared budget is exhausted, or for
    this request when a rate limit was reached. The public demo stays usable
    (with labelled deterministic outputs) instead of failing a judge's flow
    with a 429.
    """
    if not ENABLED:
        return True
    return not _degraded.get() and _exhausted_day != _today()


def mark_degraded() -> None:
    _degraded.set(True)


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def weight_for(path: str) -> int:
    return _WEIGHTS.get(path.rstrip("/") or "/", 0)


def identity(request: Request) -> str:
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        token = auth[7:].strip()
        if token:
            return "token:" + hashlib.sha256(token.encode("utf-8")).hexdigest()[:24]
    forwarded = request.headers.get("x-forwarded-for", "")
    ip = forwarded.split(",")[0].strip() if forwarded else ""
    if not ip:
        ip = request.client.host if request.client else "unknown"
    return "ip:" + ip


def _rate_ok(who: str) -> tuple[bool, str]:
    now = time.time()
    with _lock:
        q = _hits[who]
        while q and now - q[0] > 3600:
            q.popleft()
        if len(q) >= PER_HOUR:
            return False, "hourly request limit reached"
        if sum(1 for t in q if now - t <= 60) >= PER_MINUTE:
            return False, "per-minute request limit reached"
        q.append(now)
        return True, ""


def reserve(who: str, weight: int) -> tuple[bool, str]:
    """Reserve `weight` units for one request. False means: do not call Muse."""
    if not ENABLED:
        return True, ""
    ok, reason = _rate_ok(who)
    if not ok:
        return False, reason

    day = _today()
    try:
        with SessionLocal() as session:
            row = (session.query(ModelUsage)
                   .filter(ModelUsage.day == day)
                   .with_for_update()
                   .first())
            if row is None:
                row = ModelUsage(day=day, used=0)
                session.add(row)
                session.flush()
            if row.used + weight > DAILY_BUDGET:
                session.rollback()
                global _exhausted_day
                _exhausted_day = day
                return False, "daily demo model budget reached"
            row.used += weight
            session.commit()
            return True, ""
    except Exception:  # noqa: BLE001 — the DB should not take the demo down
        global _memory_day, _memory_used
        with _lock:
            if _memory_day != day:
                _memory_day = day
                _memory_used = 0
            if _memory_used + weight > DAILY_BUDGET:
                _exhausted_day = day
                return False, "daily demo model budget reached"
            _memory_used += weight
        return True, ""


def remaining_today() -> int:
    """Best-effort remaining units (for a response header)."""
    try:
        with SessionLocal() as session:
            row = session.query(ModelUsage).filter(ModelUsage.day == _today()).first()
            used = row.used if row else 0
            return max(0, DAILY_BUDGET - used)
    except Exception:  # noqa: BLE001
        return max(0, DAILY_BUDGET - _memory_used)
