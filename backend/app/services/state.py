"""Durable institution state: load/save the university model."""

from __future__ import annotations

from app.db import SessionLocal
from app.models.scenario import Scenario
from app.models.state import InstitutionState


def load_state() -> Scenario | None:
    with SessionLocal() as session:
        row = session.query(InstitutionState).order_by(InstitutionState.id.desc()).first()
        if row is None:
            return None
        try:
            return Scenario.model_validate_json(row.scenario_json)
        except Exception:  # noqa: BLE001 — a bad row must never block the app
            return None


def save_state(scenario: Scenario) -> None:
    with SessionLocal() as session:
        row = session.query(InstitutionState).order_by(InstitutionState.id.desc()).first()
        payload = scenario.model_dump_json()
        if row is None:
            session.add(InstitutionState(scenario_json=payload))
        else:
            row.scenario_json = payload
        session.commit()


def clear_state() -> None:
    with SessionLocal() as session:
        session.query(InstitutionState).delete()
        session.commit()
