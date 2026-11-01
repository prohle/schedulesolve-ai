"""Persistence: Postgres 18 (Docker), always.

The database is not optional. It holds the durable institution model, the
pre-term intake window and submissions, accounts/sessions, published
schedules, change requests, and the audit trail. If Postgres is unreachable
the backend fails fast instead of silently losing state.

Local development uses the Compose database exposed on localhost:5433;
Docker Compose overrides `DATABASE_URL` with the `db:5432` service URL.
"""

from __future__ import annotations

import os
import time

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

DEFAULT_DATABASE_URL = (
    "postgresql://schedulesolve:schedulesolve@localhost:5433/schedulesolve"
)
DATABASE_URL = os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL)

if DATABASE_URL.startswith("sqlite"):
    raise RuntimeError(
        "SQLite is not supported. This project requires Postgres 18 in Docker: "
        "`docker compose up -d db` and DATABASE_URL=postgresql://..."
    )

if DATABASE_URL.startswith("postgres://"):  # SQLAlchemy wants postgresql://
    DATABASE_URL = "postgresql://" + DATABASE_URL[len("postgres://"):]

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


_initialized = False


def init_db() -> None:
    """Create tables and run tiny migrations against Postgres.

    Retries briefly while the container warms up, then fails loudly. The
    institution model and every intake submission live here; running without
    the database would be data loss, not a degraded mode.
    """
    global _initialized
    if _initialized:
        return

    from app.models import audit  # noqa: F401  (register models)
    from app.models import auth  # noqa: F401  (users / schedules / requests)
    from app.models import term  # noqa: F401  (intake window / faculty submissions)
    from app.models import state  # noqa: F401  (durable institution model)

    last_error: Exception | None = None
    for _attempt in range(15):
        try:
            Base.metadata.create_all(bind=engine)
            _migrate_change_requests()
            _migrate_term_windows()
            _initialized = True
            return
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            time.sleep(1)
    raise RuntimeError(
        "Postgres is required but unreachable at "
        f"{DATABASE_URL.split('@')[-1]!r}. Start it with `docker compose up -d db`."
    ) from last_error


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


def _migrate_term_windows() -> None:
    """Add schedule/settings options to an existing intake window table."""
    from sqlalchemy import inspect, text

    inspector = inspect(engine)
    if "term_windows" not in inspector.get_table_names():
        return
    columns = {c["name"] for c in inspector.get_columns("term_windows")}
    if "options_json" not in columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE term_windows ADD COLUMN options_json TEXT"))
