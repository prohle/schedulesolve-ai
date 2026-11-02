"""Public-demo cost guard: weighted paths, identity, rate and daily budget."""

from __future__ import annotations

from types import SimpleNamespace

from app.services import guard


def test_weights_cover_every_model_path():
    assert guard.weight_for("/ingest") > 0
    assert guard.weight_for("/ingest/files") > guard.weight_for("/parse")
    assert guard.weight_for("/term-change/audio") > 0
    assert guard.weight_for("/scenario") == 0


def test_identity_prefers_bearer_token():
    request = SimpleNamespace(
        headers={"authorization": "Bearer secret-token", "x-forwarded-for": "1.2.3.4"},
        client=SimpleNamespace(host="9.9.9.9"),
    )
    who = guard.identity(request)
    assert who.startswith("token:")
    assert "secret-token" not in who


def test_identity_falls_back_to_forwarded_ip():
    request = SimpleNamespace(
        headers={"x-forwarded-for": "1.2.3.4, 10.0.0.1"},
        client=SimpleNamespace(host="9.9.9.9"),
    )
    assert guard.identity(request) == "ip:1.2.3.4"


def test_rate_limit_blocks_a_burst(monkeypatch):
    monkeypatch.setattr(guard, "PER_MINUTE", 2)
    monkeypatch.setattr(guard, "PER_HOUR", 100)
    guard._hits.clear()
    assert guard._rate_ok("test-burst")[0] is True
    assert guard._rate_ok("test-burst")[0] is True
    ok, reason = guard._rate_ok("test-burst")
    assert ok is False
    assert "per-minute" in reason


def test_daily_budget_blocks_and_uses_memory_on_db_failure(monkeypatch):
    monkeypatch.setattr(guard, "DAILY_BUDGET", 3)
    monkeypatch.setattr(guard, "PER_MINUTE", 100)
    monkeypatch.setattr(guard, "PER_HOUR", 100)
    monkeypatch.setattr(guard, "SessionLocal", lambda: (_ for _ in ()).throw(RuntimeError("db down")))
    monkeypatch.setattr(guard, "_memory_day", None)
    monkeypatch.setattr(guard, "_memory_used", 0)
    guard._hits.clear()

    assert guard.reserve("test-budget", 2)[0] is True
    assert guard.reserve("test-budget", 1)[0] is True
    ok, reason = guard.reserve("test-budget", 1)
    assert ok is False
    assert "budget" in reason


def test_guard_can_be_disabled(monkeypatch):
    monkeypatch.setattr(guard, "ENABLED", False)
    assert guard.reserve("anyone", 999)[0] is True
    assert guard.model_allowed() is True


def test_exhausted_or_degraded_disables_model_calls(monkeypatch):
    monkeypatch.setattr(guard, "_exhausted_day", guard._today())
    assert guard.model_allowed() is False
    monkeypatch.setattr(guard, "_exhausted_day", None)
    guard.mark_degraded()
    assert guard.model_allowed() is False
