import pytest
from fastapi.testclient import TestClient

from app import config
from app.main import app


@pytest.fixture(autouse=True)
def offline_muse(monkeypatch):
    """Tests must be deterministic and burn zero credits."""
    monkeypatch.setattr(config, "MUSE_API_KEY", None)
    # Keep the suite fast; the app default is 60 s (0 disables the cap).
    monkeypatch.setattr(config, "SOLVER_TIME_LIMIT_S", 10.0)
    monkeypatch.setattr(config, "HOME_SOLVER_TIME_LIMIT_S", 5.0)


@pytest.fixture()
def client():
    c = TestClient(app)
    c.post("/scenario/reset")
    yield c
    c.post("/scenario/reset")
