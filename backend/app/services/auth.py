"""Authentication + demo accounts (stdlib crypto only).

PBKDF2-HMAC-SHA256 password hashes with per-user salts; bearer session
tokens stored as SHA-256 hashes with a 7-day expiry. Demo accounts are
seeded from the scenario's own instructors/cohorts so every scale of the
demo (seed / department / university) has working logins:

    coordinator@northgate.edu / demo1234   (coordinator)
    <instructor-id>@northgate.edu / demo1234
    <cohort-id>@northgate.edu / demo1234
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from app.db import SessionLocal
from app.models.auth import AuthSession, User
from app.models.scenario import Scenario

DEMO_PASSWORD = "demo1234"
_ITERATIONS = 200_000


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), bytes.fromhex(salt), _ITERATIONS).hex()
    return f"pbkdf2${salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, salt, digest = stored.split("$")
    except ValueError:
        return False
    candidate = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), bytes.fromhex(salt), _ITERATIONS).hex()
    return secrets.compare_digest(candidate, digest)


def create_user(email: str, password: str, role: str, display_name: str = "",
                instructor_id: str | None = None,
                cohort_id: str | None = None) -> User:
    with SessionLocal() as session:
        user = User(email=email.lower(), password_hash=hash_password(password),
                    role=role, display_name=display_name or email,
                    instructor_id=instructor_id, cohort_id=cohort_id)
        session.add(user)
        session.commit()
        session.refresh(user)
        session.expunge(user)
        return user


def find_user(email: str) -> User | None:
    with SessionLocal() as session:
        user = session.query(User).filter(User.email == email.lower()).first()
        if user:
            session.expunge(user)
        return user


def create_session(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    with SessionLocal() as session:
        session.add(AuthSession(
            token_hash=token_hash, user_id=user_id,
            expires_at=_utcnow() + timedelta(days=7)))
        session.commit()
    return token


def user_for_token(token: str) -> User | None:
    if not token:
        return None
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    with SessionLocal() as session:
        row = session.query(AuthSession).filter(
            AuthSession.token_hash == token_hash).first()
        if row is None or row.expires_at < _utcnow():
            return None
        user = session.query(User).filter(User.id == row.user_id).first()
        if user:
            session.expunge(user)
        return user


def delete_session(token: str) -> None:
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    with SessionLocal() as session:
        session.query(AuthSession).filter(
            AuthSession.token_hash == token_hash).delete()
        session.commit()


def public_user(user: User) -> dict:
    return {"id": user.id, "email": user.email, "role": user.role,
            "display_name": user.display_name,
            "instructor_id": user.instructor_id, "cohort_id": user.cohort_id}


def seed_demo_users(scenario: Scenario) -> None:
    """Idempotent: create the demo logins for this scenario's people."""
    if find_user("coordinator@northgate.edu"):
        return
    create_user("coordinator@northgate.edu", DEMO_PASSWORD, "coordinator",
                "Term Coordinator")
    for inst in scenario.instructors:
        create_user(f"{inst.id}@northgate.edu", DEMO_PASSWORD, "instructor",
                    inst.name, instructor_id=inst.id)
    for cohort in scenario.cohorts:
        create_user(f"{cohort.id}@northgate.edu", DEMO_PASSWORD, "student",
                    f"{cohort.id.upper()} cohort", cohort_id=cohort.id)
