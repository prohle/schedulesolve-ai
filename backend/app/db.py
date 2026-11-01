"""Persistence: SQLAlchemy over Postgres (Docker) or SQLite (local dev).

The database holds constraint provenance — every intake submission and every
change event (parse / apply / drop / term_change / tighten) — the audit trail
that tells a coordinator "who said what, when". The deterministic solver core
never depends on it: every record call is best-effort, so the timetable keeps
solving even if the database is down.

`DATABASE_URL` selects the backend; unset it for a local SQLite file, or set
`postgresql://user:pass@db:5432/name` in Docker.
"""

from __future__ import annotations

import os

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./schedulesolve.db")
if DATABASE_URL.startswith("postgres://"):  # SQLAlchemy wants postgresql://
    DATABASE_URL = "postgresql://" + DATABASE_URL[len("postgres://"):]

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


def init_db() -> None:
    """Create tables. Best-effort: importing `audit` registers the models, and
    a down database must never take the solver with it."""
    from app.models import audit  # noqa: F401  (register models)
    from app.models import auth  # noqa: F401  (users / schedules / requests)
    from app.models import term  # noqa: F401  (intake window / faculty submissions)

    try:
        Base.metadata.create_all(bind=engine)
        _migrate_change_requests()
    except Exception:  # noqa: BLE001
        pass


def _migrate_change_requests() -> None:
    """create_all never alters existing tables: add the structured-intake
    `operations` column to change_requests where it predates it."""
    from sqlalchemy import inspect, text

    inspector = inspect(engine)
    if "change_requests" not in inspector.get_table_names():
        return
    columns = {c["name"] for c in inspector.get_columns("change_requests")}
    if "operations" not in columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE change_requests ADD COLUMN operations TEXT"))