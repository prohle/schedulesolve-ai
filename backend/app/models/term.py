"""Pre-term intake window: the deadline before the term begins.

Every faculty member enters their hard constraints and soft preferences
inside the window. The coordinator reviews the submissions, accepts them,
and the accepted set becomes the institution model the solver builds on.

The window is deliberately durable (DB) while the scenario itself stays in
memory: the deadline, who submitted and what they said are provenance.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Integer, String, Text, UniqueConstraint

from app.db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class TermWindow(Base):
    __tablename__ = "term_windows"

    id = Column(Integer, primary_key=True)
    term = Column(String(200), nullable=False)
    opens_at = Column(DateTime, nullable=False, default=_utcnow)
    deadline = Column(DateTime, nullable=False)
    weeks = Column(Integer, default=16)
    status = Column(String(20), default="draft")  # draft | open | closed | accepted
    options_json = Column(Text)  # schedule/calendar settings (engine, start/end, auto-publish)
    accepted_at = Column(DateTime)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)


class FacultyIntake(Base):
    __tablename__ = "faculty_intake"
    __table_args__ = (UniqueConstraint("window_id", "instructor_id", name="uq_intake_window_instructor"),)

    id = Column(Integer, primary_key=True)
    window_id = Column(Integer, nullable=False, index=True)
    instructor_id = Column(String(100), nullable=False, index=True)
    hard_unavailable = Column(Text)  # JSON list[SlotRef]
    preferences = Column(Text)       # JSON list[InstructorPreference]
    note = Column(Text)
    status = Column(String(20), default="submitted")  # submitted | accepted | returned
    submitted_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)
