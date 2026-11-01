"""Provenance tables: the audit trail ("who said what, when, what changed")."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Integer, String, Text

from app.db import Base


def _utcnow() -> datetime:
    # Naive UTC, stored consistently in Postgres.
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Submission(Base):
    """One natural-language intake / directive, as typed and parsed."""

    __tablename__ = "submissions"

    id = Column(Integer, primary_key=True)
    message = Column(Text, nullable=False)
    summary = Column(Text)
    parser_mode = Column(String(20))
    created_at = Column(DateTime, default=_utcnow)


class Event(Base):
    """One change event in the self-healing execution stream."""

    __tablename__ = "events"

    id = Column(Integer, primary_key=True)
    kind = Column(String(40), nullable=False)  # parse / apply / drop / term_change / tighten
    description = Column(Text)
    payload = Column(Text)  # JSON string
    created_at = Column(DateTime, default=_utcnow)