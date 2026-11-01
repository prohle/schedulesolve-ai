"""PhD reading/research reservations (1-3 credits, Fall entry, supervisor cap).

A PhD student reserves a 1-3 credit independent study with a professor who
accepts PhD students. The professor's Fall intake is capped (3 by default,
policy ceiling 5), and the reservation is a durable record that survives the
term. Master's and bachelor's students are not eligible for this mechanism.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from app.models.scenario import PhDReservation, Scenario, Student


def _now() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat()


def _is_fall(term: str) -> bool:
    text = (term or "").lower()
    if "fall" in text or "autumn" in text:
        return True
    if text in ("current", ""):
        return True  # the current demo term is an Autumn term
    return False


def _student(sc: Scenario, student_id: str) -> Student:
    student = next((s for s in sc.students if s.id == student_id), None)
    if student is None:
        raise ValueError(f"unknown student {student_id!r}")
    return student


def _approved_count(sc: Scenario, instructor_id: str, term: str) -> int:
    return sum(
        1 for r in sc.phd_reservations
        if r.instructor_id == instructor_id and r.term == term
        and r.status == "approved"
    )


def phd_capacity(sc: Scenario, instructor_id: str, term: str = "current") -> dict:
    instructor = sc.instructor(instructor_id)
    cap = min(instructor.max_phd_students, sc.policy.phd_max_students_per_fall)
    used = _approved_count(sc, instructor_id, term)
    return {
        "instructor_id": instructor_id,
        "accepts_phd": instructor.accepts_phd,
        "term": term,
        "cap": cap,
        "approved": used,
        "remaining": max(0, cap - used),
        "fall_only": True,
    }


def request_reservation(
    sc: Scenario,
    *,
    student_id: str,
    instructor_id: str,
    course_id: str,
    credits: int = 3,
    term: str = "current",
    note: str = "",
) -> tuple[Scenario, PhDReservation]:
    """Create a requested reservation after every eligibility check."""
    student = _student(sc, student_id)
    if student.level != "phd":
        raise ValueError("only PhD students may reserve a research course")
    if not _is_fall(term):
        raise ValueError("PhD entry/reservations are Fall-term only")
    if not sc.policy.phd_min_credits <= credits <= sc.policy.phd_max_credits:
        raise ValueError(
            f"PhD reservation credits must be {sc.policy.phd_min_credits}-"
            f"{sc.policy.phd_max_credits}")

    instructor = sc.instructor(instructor_id)
    if not instructor.accepts_phd:
        raise ValueError(f"{instructor.name} does not accept PhD students")
    if not any(c.id == course_id for c in sc.courses):
        raise ValueError(f"unknown course {course_id!r}")

    cap = phd_capacity(sc, instructor_id, term)
    if cap["remaining"] <= 0:
        raise ValueError(
            f"{instructor.name} already has {cap['cap']} approved PhD "
            f"students for {term}")

    reservation = PhDReservation(
        id=f"phd-{len(sc.phd_reservations) + 1}",
        student_id=student_id,
        instructor_id=instructor_id,
        course_id=course_id,
        credits=credits,
        term=term,
        status="requested",
        note=note,
    )
    sc.phd_reservations.append(reservation)
    return sc, reservation


def decide_reservation(
    sc: Scenario,
    reservation_id: str,
    *,
    approve: bool,
    note: str = "",
) -> tuple[Scenario, PhDReservation]:
    reservation = next(
        (r for r in sc.phd_reservations if r.id == reservation_id), None)
    if reservation is None:
        raise ValueError(f"unknown reservation {reservation_id!r}")
    if reservation.status != "requested":
        raise ValueError("reservation already decided")
    if approve:
        cap = phd_capacity(sc, reservation.instructor_id, reservation.term)
        if cap["remaining"] <= 0:
            raise ValueError(
                f"{reservation.instructor_id} is at the Fall PhD intake cap")
        reservation.status = "approved"
    else:
        reservation.status = "rejected"
    if note:
        reservation.note = note
    return sc, reservation


def phd_summary(sc: Scenario) -> dict:
    by_level: dict[str, int] = {}
    for student in sc.students:
        by_level[student.level] = by_level.get(student.level, 0) + 1
    return {
        "students_by_level": by_level,
        "reservations": [r.model_dump() for r in sc.phd_reservations],
        "approved": sum(1 for r in sc.phd_reservations if r.status == "approved"),
        "requested": sum(1 for r in sc.phd_reservations if r.status == "requested"),
        "fall_only": True,
        "credits": {
            "min": sc.policy.phd_min_credits,
            "max": sc.policy.phd_max_credits,
        },
        "per_professor_cap": sc.policy.phd_max_students_per_fall,
    }
