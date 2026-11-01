"""Term catalog decisions: not-taught courses and special topics.

Real catalogs contain courses nobody has taught in years, courses paused for a
term, and one-off special topics opened by a department. The coordinator makes
those decisions explicitly; this service keeps the durable record and keeps
the solver's section list consistent with it.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from app.models.scenario import (
    Course,
    CourseOffering,
    Section,
    Scenario,
)


def _now() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat()


def _record(sc: Scenario, course_id: str, status: str, reason: str,
            department: str, term: str, recorded_by: str) -> CourseOffering:
    existing = next((o for o in sc.course_offerings if o.course_id == course_id), None)
    if existing is None:
        existing = CourseOffering(course_id=course_id)
        sc.course_offerings.append(existing)
    existing.status = status
    existing.reason = reason
    existing.department = department
    existing.term = term
    existing.recorded_by = recorded_by
    existing.recorded_at = _now()
    return existing


def _drop_sections(sc: Scenario, course_id: str) -> None:
    removed = {s.id for s in sc.sections if s.course_id == course_id}
    sc.sections = [s for s in sc.sections if s.course_id != course_id]
    for sid in removed:
        sc.active_enrollment.pop(sid, None)
        sc.instructor_pins.pop(sid, None)
        sc.room_pins.pop(sid, None)


def set_offering(
    sc: Scenario,
    course_id: str,
    status: str,
    *,
    reason: str = "",
    department: str = "",
    term: str = "current",
    recorded_by: str = "",
    section_count: int = 1,
) -> Scenario:
    """Declare a catalog course offered / not offered / dormant for a term."""
    if status not in ("offered", "not_offered", "dormant"):
        raise ValueError(f"unknown offering status {status!r}")
    course = next((c for c in sc.courses if c.id == course_id), None)
    if course is None:
        raise ValueError(f"unknown course {course_id!r}")

    _record(sc, course_id, status, reason, department or course.department,
            term, recorded_by)

    if status == "dormant":
        course.catalog_status = "dormant"
    elif status == "offered":
        course.catalog_status = "active"

    if status in ("not_offered", "dormant"):
        _drop_sections(sc, course_id)
    elif not any(s.course_id == course_id for s in sc.sections):
        for index in range(max(1, section_count)):
            suffix = "" if index == 0 else f"-{index + 1}"
            sc.sections.append(Section(id=f"sec-{course_id}{suffix}",
                                       course_id=course_id))
    return sc


def add_special_topic(
    sc: Scenario,
    *,
    code: str,
    title: str,
    department: str,
    instructor_id: str,
    credits: int = 3,
    pattern: str = "TTh",
    room_type: str = "seminar",
    seats: int = 20,
    equipment: Optional[list[str]] = None,
    term: str = "current",
    reason: str = "",
    recorded_by: str = "",
) -> tuple[Scenario, Course]:
    """Open a one-off special topic and put it on the solver's section list."""
    if not 1 <= credits <= 4:
        raise ValueError("special-topic credits must be 1-4")
    if not any(i.id == instructor_id for i in sc.instructors):
        raise ValueError(f"unknown instructor {instructor_id!r}")
    if any(c.code == code for c in sc.courses):
        raise ValueError(f"course code {code!r} already exists")

    course_id = f"topic-{code.lower().replace(' ', '-')}"
    if any(c.id == course_id for c in sc.courses):
        raise ValueError(f"special topic {code!r} already exists this term")
    if pattern not in {p.name for p in sc.time_grid.patterns}:
        raise ValueError(f"unknown meeting pattern {pattern!r}")
    if room_type not in ("lecture", "lab", "seminar"):
        raise ValueError(f"unknown room type {room_type!r}")

    course = Course(
        id=course_id, code=code, title=title, pattern=pattern,
        room_type=room_type, seats=seats,
        equipment=list(equipment or (["video-conf", "whiteboard"]
                                     if room_type == "seminar" else ["projector"])),
        credits=credits, is_special_topic=True, department=department,
    )
    sc.courses.append(course)
    sc.sections.append(Section(id=f"sec-{course_id}", course_id=course_id))

    instructor = sc.instructor(instructor_id)
    if course_id not in instructor.qualified_courses:
        instructor.qualified_courses.append(course_id)
    sc.instructor_pins[f"sec-{course_id}"] = instructor_id

    _record(sc, course_id, "special_topic", reason or title, department,
            term, recorded_by)
    return sc, course


def remove_special_topic(sc: Scenario, course_id: str, *,
                         reason: str = "", recorded_by: str = "") -> Scenario:
    course = next((c for c in sc.courses if c.id == course_id), None)
    if course is None or not course.is_special_topic:
        raise ValueError(f"{course_id!r} is not a special topic")
    _record(sc, course_id, "not_offered", reason or "special topic withdrawn",
            course.department, "current", recorded_by)
    _drop_sections(sc, course_id)
    sc.courses = [c for c in sc.courses if c.id != course_id]
    for instructor in sc.instructors:
        instructor.qualified_courses = [
            cid for cid in instructor.qualified_courses if cid != course_id
        ]
    return sc


def offering_summary(sc: Scenario) -> dict:
    """Catalog accounting for the coordinator's term view."""
    statuses = {o.course_id: o.status for o in sc.course_offerings}
    counts = {"offered": 0, "not_offered": 0, "dormant": 0, "special_topic": 0}
    for course in sc.courses:
        if course.is_special_topic:
            counts["special_topic"] += 1
        elif course.catalog_status == "dormant":
            counts["dormant"] += 1
        else:
            counts[statuses.get(course.id, "offered")] += 1
    return {
        "counts": counts,
        "records": [o.model_dump() for o in sc.course_offerings],
        "not_offered": [
            c.code for c in sc.courses
            if statuses.get(c.id) == "not_offered"
        ],
        "dormant": [c.code for c in sc.courses if c.catalog_status == "dormant"],
        "special_topics": [
            {"code": c.code, "title": c.title, "credits": c.credits,
             "department": c.department}
            for c in sc.courses if c.is_special_topic
        ],
    }
