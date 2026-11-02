import pytest
from fastapi.testclient import TestClient

from app import config
from app.main import app
from app.services import guard


@pytest.fixture(autouse=True)
def reset_model_guard():
    """Each test starts with a clean budget/rate/degraded state."""
    guard._exhausted_day = None
    guard._degraded.set(False)
    guard._hits.clear()
    yield


@pytest.fixture(autouse=True)
def offline_muse(monkeypatch):
    """Tests must be deterministic and burn zero credits."""
    monkeypatch.setattr(config, "MUSE_API_KEY", None)
    # Voice ASR is a hosted Meta endpoint even when chat runs on Baseten.
    monkeypatch.setattr(config, "MUSE_ASR_API_KEY", None)
    # Keep the suite bounded, but leave headroom: a 10 s cap made the
    # comprehensive-instance tests flaky on slower CI runners, where CP-SAT
    # can return "unknown" just before the optimum. The app default is 60 s.
    monkeypatch.setattr(config, "SOLVER_TIME_LIMIT_S", 30.0)
    monkeypatch.setattr(config, "HOME_SOLVER_TIME_LIMIT_S", 15.0)


@pytest.fixture()
def client():
    c = TestClient(app)
    c.post("/scenario/reset")
    yield c
    c.post("/scenario/reset")
