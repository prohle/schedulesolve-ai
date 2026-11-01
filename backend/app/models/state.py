"""Durable institution state.

The university model is the thing a real institution should not have to
re-upload every term: it is stored as one JSON document and updated in place
by imports, coordinator edits and accepted intake.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Integer, Text

from app.db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class InstitutionState(Base):
    __tablename__ = "institution_state"

    id = Column(Integer, primary_key=True)
    scenario_json = Column(Text, nullable=False)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)
