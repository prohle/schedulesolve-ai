"""Pre-term intake window + institution model overview.

The term starts with a deadline: every faculty member enters hard constraints
and soft preferences, the coordinator accepts the set, and only then does the
solver build the timetable. This service owns that window, the submissions,
and the "understanding of the university" the coordinator reviews/edits.
"""

from __future__ import annotations

import json
import random
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.db import SessionLocal
from app.models.scenario import (
    InstructorPreference,
    Scenario,
    SlotRef,
    TermClosure,
)
from app.models.term import FacultyIntake, TermWindow

DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
PERIOD_NAMES = ["8:00", "9:30", "11:00", "12:30"]


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _iso(value: Optional[datetime]) -> Optional[str]:
    return value.isoformat() if value else None


def _parse(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    text = value.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(text)
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


def _default_window(scenario: Scenario) -> TermWindow:
    now = _utcnow()
    return TermWindow(
        term=scenario.name or "Upcoming term",
        opens_at=now,
        deadline=now + timedelta(days=14),
        weeks=16,
        status="open",
    )


def get_window(scenario: Scenario) -> TermWindow:
    """The active window, created on first read so the flow always works."""
    with SessionLocal() as session:
        row = session.query(TermWindow).order_by(TermWindow.id.desc()).first()
        if row is None:
            row = _default_window(scenario)
            session.add(row)
            session.commit()
            session.refresh(row)
        session.expunge(row)
        return row


def _window_row(session) -> TermWindow:
    row = session.query(TermWindow).order_by(TermWindow.id.desc()).first()
    if row is None:
        raise ValueError("No intake window yet.")
    return row


def set_window(
    scenario: Scenario,
    *,
    term: Optional[str] = None,
    opens_at: Optional[str] = None,
    deadline: Optional[str] = None,
    weeks: Optional[int] = None,
    status: Optional[str] = None,
) -> TermWindow:
    with SessionLocal() as session:
        row = session.query(TermWindow).order_by(TermWindow.id.desc()).first()
        if row is None:
            row = _default_window(scenario)
            session.add(row)
            session.flush()
        if term:
            row.term = term.strip()
        if opens_at:
            row.opens_at = _parse(opens_at) or row.opens_at
        if deadline:
            row.deadline = _parse(deadline) or row.deadline
        if weeks is not None:
            row.weeks = max(1, min(52, int(weeks)))
        if status:
            row.status = status
        if row.deadline <= row.opens_at:
            row.deadline = row.opens_at + timedelta(days=14)
        row.updated_at = _utcnow()
        session.commit()
        session.refresh(row)
        session.expunge(row)
        return row


def open_window(scenario: Scenario) -> TermWindow:
    window = get_window(scenario)
    return set_window(scenario, status="open", opens_at=window.opens_at.isoformat())


def close_window(scenario: Scenario) -> TermWindow:
    return set_window(scenario, status="closed")


def _submission_dict(row: FacultyIntake, instructor_name: str = "") -> dict:
    hard = json.loads(row.hard_unavailable) if row.hard_unavailable else []
    prefs = json.loads(row.preferences) if row.preferences else []
    return {
        "id": row.id,
        "instructor_id": row.instructor_id,
        "instructor_name": instructor_name or row.instructor_id,
        "status": row.status,
        "note": row.note or "",
        "hard_unavailable": hard,
        "preferences": prefs,
        "hard_count": len(hard),
        "preference_count": len(prefs),
        "submitted_at": _iso(row.submitted_at),
        "updated_at": _iso(row.updated_at),
    }


def _options(window: TermWindow) -> dict:
    if not window.options_json:
        return {}
    try:
        return json.loads(window.options_json)
    except (TypeError, ValueError):
        return {}


def set_options(scenario: Scenario, patch: dict) -> TermWindow:
    with SessionLocal() as session:
        row = _window_row(session)
        current = _options(row)
        current.update(patch or {})
        row.options_json = json.dumps(current)
        row.updated_at = _utcnow()
        session.commit()
        session.refresh(row)
        session.expunge(row)
        return row


def window_state(scenario: Scenario) -> dict:
    window = get_window(scenario)
    now = _utcnow()
    with SessionLocal() as session:
        rows = (
            session.query(FacultyIntake)
            .filter(FacultyIntake.window_id == window.id)
            .order_by(FacultyIntake.instructor_id)
            .all()
        )
        names = {i.id: i.name for i in scenario.instructors}
        valid_ids = set(names)
        submissions = [
            _submission_dict(row, names.get(row.instructor_id, ""))
            for row in rows
            if row.instructor_id in valid_ids
        ]

    submitted = {s["instructor_id"] for s in submissions}
    deadline_passed = now > window.deadline
    seconds_left = max(0, int((window.deadline - now).total_seconds()))
    return {
        "id": window.id,
        "term": window.term,
        "status": window.status,
        "opens_at": _iso(window.opens_at),
        "deadline": _iso(window.deadline),
        "weeks": window.weeks,
        "accepted_at": _iso(window.accepted_at),
        "deadline_passed": deadline_passed,
        "seconds_left": seconds_left,
        "days_left": seconds_left // 86400,
        "open": window.status == "open" and not deadline_passed,
        "total_faculty": len(scenario.instructors),
        "submitted_count": len(submitted),
        "pending": [i.id for i in scenario.instructors if i.id not in submitted],
        "submissions": submissions,
        "options": _options(window),
    }


def submit_intake(
    scenario: Scenario,
    instructor_id: str,
    *,
    hard_unavailable: list[dict],
    preferences: list[dict],
    note: str = "",
) -> dict:
    window = get_window(scenario)
    if window.status != "open":
        raise ValueError("The intake window is not open.")
    if _utcnow() > window.deadline:
        raise ValueError("The intake deadline has passed.")
    instructor = next((i for i in scenario.instructors if i.id == instructor_id), None)
    if instructor is None:
        raise ValueError("Unknown instructor.")

    hard = [SlotRef.model_validate(item).model_dump() for item in hard_unavailable]
    prefs = [
        InstructorPreference.model_validate(item).model_dump()
        for item in preferences
    ]

    with SessionLocal() as session:
        row = (
            session.query(FacultyIntake)
            .filter(
                FacultyIntake.window_id == window.id,
                FacultyIntake.instructor_id == instructor_id,
            )
            .first()
        )
        if row is None:
            row = FacultyIntake(window_id=window.id, instructor_id=instructor_id)
            session.add(row)
        row.hard_unavailable = json.dumps(hard)
        row.preferences = json.dumps(prefs)
        row.note = note.strip()
        row.status = "submitted"
        row.submitted_at = row.submitted_at or _utcnow()
        row.updated_at = _utcnow()
        session.commit()
        session.refresh(row)
        session.expunge(row)
        return _submission_dict(row, instructor.name)


def _stable_seed(text: str) -> int:
    """Deterministic per-professor seed so the demo is reproducible."""
    return sum((index + 1) * ord(char) for index, char in enumerate(text))


def simulate_intake(
    scenario: Scenario,
    *,
    accept: bool = True,
    only_missing: bool = False,
) -> tuple[Scenario, dict]:
    """Fill faculty feedback with realistic randomized constraints.

    Judges should not have to wait for 68 professors to type. This generates
    hard blackouts, day/period preferences and course wishes per professor,
    stores them as normal submissions, and (optionally) accepts the set so the
    solver immediately has a complete institution model.
    """
    window = get_window(scenario)
    if window.status == "accepted":
        if not accept:
            return scenario, {"generated": 0, "accepted": 0, "term": window.term}
        # Re-simulation is allowed: reopen, replace the set, accept again.
        window = set_window(scenario, status="open")

    generated = 0
    with SessionLocal() as session:
        for instructor in scenario.instructors:
            existing = (
                session.query(FacultyIntake)
                .filter(
                    FacultyIntake.window_id == window.id,
                    FacultyIntake.instructor_id == instructor.id,
                )
                .first()
            )
            if only_missing and existing is not None:
                continue

            rng = random.Random(_stable_seed(f"{window.id}:{instructor.id}"))
            slots = [(day, period) for day in range(5) for period in range(4)]
            hard = [
                {"day": day, "period": period}
                for day, period in rng.sample(slots, rng.choice([0, 1, 1, 2]))
            ]
            hard_keys = {(slot["day"], slot["period"]) for slot in hard}

            preferences: list[dict] = []
            # Day-level wishes.
            for day in rng.sample(range(5), rng.choice([1, 2])):
                if any(day == slot["day"] for slot in hard):
                    continue
                preferences.append({
                    "kind": rng.choice(["prefer", "avoid"]),
                    "day": day,
                    "period": None,
                    "course_id": None,
                    "weight": rng.choice([5, 8, 10]),
                })
            # Period-level wishes.
            for period in rng.sample(range(4), rng.choice([0, 1])):
                preferences.append({
                    "kind": rng.choice(["prefer", "avoid"]),
                    "day": None,
                    "period": period,
                    "course_id": None,
                    "weight": rng.choice([5, 8]),
                })
            # Course wishes from the professor's own qualifications.
            if instructor.qualified_courses:
                for course_id in rng.sample(
                    instructor.qualified_courses,
                    min(len(instructor.qualified_courses), rng.choice([1, 1, 2])),
                ):
                    preferences.append({
                        "kind": "prefer",
                        "day": None,
                        "period": None,
                        "course_id": course_id,
                        "weight": 8,
                    })
            # Never contradict a hard blackout with a "prefer" on that slot.
            preferences = [
                pref for pref in preferences
                if not (
                    pref.get("day") is not None
                    and pref.get("period") is not None
                    and (pref["day"], pref["period"]) in hard_keys
                    and pref["kind"] == "prefer"
                )
            ]

            row = existing or FacultyIntake(
                window_id=window.id, instructor_id=instructor.id
            )
            if existing is None:
                session.add(row)
            row.hard_unavailable = json.dumps(hard)
            row.preferences = json.dumps(preferences)
            row.note = "Simulated faculty feedback (demo)."
            row.status = "submitted"
            row.submitted_at = row.submitted_at or _utcnow()
            row.updated_at = _utcnow()
            generated += 1
        session.commit()

    if accept:
        updated, summary = accept_window(scenario)
        summary["generated"] = generated
        return updated, summary
    return scenario, {"generated": generated, "accepted": 0, "term": window.term}


def accept_window(scenario: Scenario) -> tuple[Scenario, dict]:
    """Fold every submission into the institution model and lock the term."""
    window = get_window(scenario)
    if window.status == "accepted":
        raise ValueError("This term's intake was already accepted.")
    with SessionLocal() as session:
        window_row = _window_row(session)
        rows = (
            session.query(FacultyIntake)
            .filter(FacultyIntake.window_id == window_row.id)
            .all()
        )
        if not rows:
            raise ValueError("No faculty submissions to accept yet.")

        updated = scenario.model_copy(deep=True)
        by_id = {i.id: i for i in updated.instructors}
        applied = 0
        for row in rows:
            instructor = by_id.get(row.instructor_id)
            if instructor is None:
                continue
            if row.hard_unavailable:
                instructor.hard_unavailable = [
                    SlotRef.model_validate(item)
                    for item in json.loads(row.hard_unavailable)
                ]
            if row.preferences:
                instructor.preferences = [
                    InstructorPreference.model_validate(item)
                    for item in json.loads(row.preferences)
                ]
            row.status = "accepted"
            applied += 1

        window_row.status = "accepted"
        window_row.accepted_at = _utcnow()
        window_row.updated_at = _utcnow()
        accepted_at = window_row.accepted_at
        term = window_row.term
        session.commit()

    summary = {
        "accepted": applied,
        "term": term,
        "accepted_at": _iso(accepted_at),
    }
    return updated, summary


# --- institution overview ----------------------------------------------------


def _course_codes(scenario: Scenario, ids: list[str]) -> list[str]:
    by_id = {c.id: c.code for c in scenario.courses}
    return [by_id.get(course_id, course_id) for course_id in ids]


def overview(scenario: Scenario, placements: Optional[list[dict]] = None) -> dict:
    window = get_window(scenario)
    placements = placements or []

    loads: dict[str, int] = {}
    preps: dict[str, set[str]] = {}
    for placement in placements:
        instructor_id = placement.get("instructor_id", "")
        loads[instructor_id] = loads.get(instructor_id, 0) + 1
        preps.setdefault(instructor_id, set()).add(placement.get("course_id", ""))

    rooms_by_building: dict[str, list] = {}
    for room in scenario.rooms:
        rooms_by_building.setdefault(room.building_id, []).append(room)

    # Peak *simultaneous* building occupancy (day + period), matching the
    # solver's building_balance objective. Recomputed from whatever term is
    # currently placed/published.
    building_cell_load: dict[tuple[str, int, int], int] = {}
    building_sections: dict[str, int] = {}
    for placement in placements:
        building_id = placement.get("building_id", "")
        enrollment = placement.get("enrollment") or 0
        building_sections[building_id] = building_sections.get(building_id, 0) + 1
        days = placement.get("days") or []
        periods = placement.get("periods")
        if not periods:
            period = placement.get("period")
            periods = [period] if period is not None else []
        for day in days:
            for period in periods:
                key = (building_id, int(day), int(period))
                building_cell_load[key] = building_cell_load.get(key, 0) + enrollment

    def building_utilization(building_id: str) -> dict:
        rooms = rooms_by_building.get(building_id, [])
        capacity = sum(room.capacity for room in rooms)
        peak = max(
            (seats for (bid, _day, _period), seats in building_cell_load.items() if bid == building_id),
            default=0,
        )
        return {
            "capacity": capacity,
            "peak_seats": peak,
            "utilization": round(100 * peak / capacity) if capacity else 0,
            "scheduled_sections": building_sections.get(building_id, 0),
        }

    buildings = [
        {
            "id": building.id,
            "name": building.name,
            "campus": building.campus or "Main Campus",
            "rooms": len(rooms_by_building.get(building.id, [])),
            "seats": sum(room.capacity for room in rooms_by_building.get(building.id, [])),
            **building_utilization(building.id),
        }
        for building in scenario.buildings
    ]
    building_utilization_report = [
        {
            "id": building["id"],
            "name": building["name"],
            "campus": building["campus"],
            "capacity": building["capacity"],
            "peak_seats": building["peak_seats"],
            "utilization": building["utilization"],
            "scheduled_sections": building["scheduled_sections"],
        }
        for building in buildings
    ]
    campuses: dict[str, dict] = {}
    for building in buildings:
        campus_name = building["campus"]
        entry = campuses.setdefault(
            campus_name,
            {"id": campus_name.lower().replace(" ", "-"), "name": campus_name, "buildings": []},
        )
        entry["buildings"].append(building)

    rooms = [
        {
            "id": room.id,
            "name": room.name,
            "building_id": room.building_id,
            "building_name": next(
                (b.name for b in scenario.buildings if b.id == room.building_id), room.building_id
            ),
            "capacity": room.capacity,
            "room_type": room.room_type,
            "equipment": room.equipment,
            "hall": room.capacity >= 100,
        }
        for room in scenario.rooms
    ]

    faculty = [
        {
            "id": instructor.id,
            "name": instructor.name,
            "max_sections": instructor.max_sections,
            "max_preps": instructor.max_preps,
            "qualified_courses": _course_codes(scenario, instructor.qualified_courses),
            "assigned_sections": loads.get(instructor.id, 0),
            "preps": len(preps.get(instructor.id, set())),
            "load_pct": round(
                100 * loads.get(instructor.id, 0) / max(1, instructor.max_sections)
            ),
            "hard_unavailable": [slot.model_dump() for slot in instructor.hard_unavailable],
            "preferences": [pref.model_dump() for pref in instructor.preferences],
        }
        for instructor in scenario.instructors
    ]

    total_capacity = sum(i.max_sections for i in scenario.instructors)
    sections = len(scenario.sections)
    programs = [
        {
            "id": program.id,
            "name": program.name,
            "kind": program.kind,
            "degree": program.degree,
            "department": program.department,
            "roadmap": {
                term: [requirement.model_dump() for requirement in requirements]
                for term, requirements in program.roadmap.items()
            },
        }
        for program in scenario.programs
    ]
    cohorts = [
        {
            "id": cohort.id,
            "name": cohort.name,
            "program_id": cohort.program_id,
            "program_name": next(
                (p.name for p in scenario.programs if p.id == cohort.program_id),
                cohort.program_id,
            ),
            "current_term": cohort.current_term,
            "size": cohort.size,
            "admission_year": cohort.admission_year,
            "graduation_year": cohort.graduation_year,
            "term_courses": _course_codes(
                scenario, scenario.cohort_term_courses(cohort)
            ),
        }
        for cohort in scenario.cohorts
    ]

    options = _options(window)
    start = _parse(options.get("start_date")) or (window.deadline + timedelta(days=1))
    end = _parse(options.get("end_date")) or (start + timedelta(days=7 * window.weeks))
    return {
        "term": {
            "name": window.term,
            "weeks": window.weeks,
            "status": window.status,
            "opens_at": _iso(window.opens_at),
            "deadline": _iso(window.deadline),
            "start_date": _iso(start),
            "end_date": _iso(end),
            "exam_week_start": _iso(end - timedelta(days=7)),
        },
        "options": options,
        "programs": programs,
        "cohorts": cohorts,
        "campuses": list(campuses.values()),
        "buildings": buildings,
        "building_utilization": building_utilization_report,
        "rooms": rooms,
        "halls": [room for room in rooms if room["hall"]],
        "faculty": faculty,
        "load_rules": {
            "walk_limit_min": scenario.walk_limit_min,
            "total_sections": sections,
            "faculty_capacity_sections": total_capacity,
            "capacity_gap": total_capacity - sections,
            "max_sections_per_instructor": max(
                (i.max_sections for i in scenario.instructors), default=0
            ),
            "max_preps_per_instructor": max(
                (i.max_preps for i in scenario.instructors), default=0
            ),
            "patterns": {
                "MWF": {"days": [0, 2, 4], "hours": 1.5},
                "TTh": {"days": [1, 3], "hours": 1.5},
                "block": {"days": [1, 2, 3], "hours": 3.0},
            },
            "periods": PERIOD_NAMES,
            "days": DAY_NAMES,
        },
        "weeks": {
            "count": window.weeks,
            "teaching_days": DAY_NAMES,
            "periods_per_day": len(PERIOD_NAMES),
            "pattern": "weekly timetable repeated across the term",
        },
        "holidays": [closure.model_dump() for closure in scenario.closures],
        "constraints": {
            "walk_limit_min": scenario.walk_limit_min,
            "closures": len(scenario.closures),
            "room_blackouts": len(scenario.room_blackouts),
            "active_enrollment": len(scenario.active_enrollment),
            "instructor_pins": len(scenario.instructor_pins),
            "room_pins": len(scenario.room_pins),
        },
        "degree_maps": {"programs": programs, "cohorts": cohorts},
        "courses": [
            {
                "id": course.id,
                "code": course.code,
                "title": course.title,
                "pattern": course.pattern,
                "room_type": course.room_type,
                "seats": course.seats,
                "equipment": course.equipment,
                "duration": course.duration,
            }
            for course in scenario.courses
        ],
        "counts": {
            "buildings": len(scenario.buildings),
            "rooms": len(scenario.rooms),
            "halls": sum(1 for room in rooms if room["hall"]),
            "faculty": len(scenario.instructors),
            "courses": len(scenario.courses),
            "sections": sections,
            "cohorts": len(scenario.cohorts),
            "programs": len(scenario.programs),
        },
    }


# --- coordinator edits -------------------------------------------------------


def _validate(scenario: Scenario) -> Scenario:
    return Scenario.model_validate(scenario.model_dump())


def update_entity(scenario: Scenario, kind: str, entity_id: str, patch: dict) -> Scenario:
    updated = scenario.model_copy(deep=True)

    if kind == "building":
        target = next((b for b in updated.buildings if b.id == entity_id), None)
        if target is None:
            raise ValueError("Building not found.")
        if "name" in patch:
            target.name = str(patch["name"])
    elif kind in ("room", "hall"):
        target = next((r for r in updated.rooms if r.id == entity_id), None)
        if target is None:
            raise ValueError("Room not found.")
        for field in ("name", "building_id", "room_type"):
            if field in patch:
                setattr(target, field, str(patch[field]))
        if "capacity" in patch:
            target.capacity = max(1, int(patch["capacity"]))
        if "equipment" in patch:
            target.equipment = [str(item) for item in patch["equipment"]]
    elif kind == "instructor":
        target = next((i for i in updated.instructors if i.id == entity_id), None)
        if target is None:
            raise ValueError("Instructor not found.")
        if "name" in patch:
            target.name = str(patch["name"])
        if "max_sections" in patch:
            target.max_sections = max(0, int(patch["max_sections"]))
        if "max_preps" in patch:
            target.max_preps = max(0, int(patch["max_preps"]))
        if "qualified_courses" in patch:
            target.qualified_courses = [str(item) for item in patch["qualified_courses"]]
    elif kind == "cohort":
        target = next((c for c in updated.cohorts if c.id == entity_id), None)
        if target is None:
            raise ValueError("Cohort not found.")
        for field in ("name", "program_id"):
            if field in patch:
                setattr(target, field, str(patch[field]))
        for field in ("size", "current_term", "admission_year", "graduation_year"):
            if field in patch:
                setattr(target, field, int(patch[field]))
    elif kind == "program":
        target = next((p for p in updated.programs if p.id == entity_id), None)
        if target is None:
            raise ValueError("Program not found.")
        if "name" in patch:
            target.name = str(patch["name"])
        if "roadmap" in patch:
            target.roadmap = {
                str(term): [
                    {
                        "course_id": str(item["course_id"]),
                        "required": bool(item.get("required", True)),
                        "seat_estimate": item.get("seat_estimate"),
                    }
                    for item in requirements
                ]
                for term, requirements in patch["roadmap"].items()
            }
    elif kind == "course":
        target = next((c for c in updated.courses if c.id == entity_id), None)
        if target is None:
            raise ValueError("Course not found.")
        for field in ("code", "title", "pattern", "room_type"):
            if field in patch:
                setattr(target, field, str(patch[field]))
        if "seats" in patch:
            target.seats = max(1, int(patch["seats"]))
        if "equipment" in patch:
            target.equipment = [str(item) for item in patch["equipment"]]
        if "duration" in patch:
            target.duration = float(patch["duration"])
    elif kind == "closure":
        index = int(entity_id)
        if index < 0 or index >= len(updated.closures):
            raise ValueError("Closure not found.")
        closure = updated.closures[index]
        if "label" in patch:
            closure.label = str(patch["label"])
        if "day" in patch:
            closure.day = int(patch["day"])
        if "period" in patch:
            closure.period = None if patch["period"] in (None, "") else int(patch["period"])
    elif kind == "constraint":
        if entity_id == "walk_limit_min" and "value" in patch:
            updated.walk_limit_min = max(0, int(patch["value"]))
        else:
            raise ValueError("Unknown constraint.")
    else:
        raise ValueError(f"Unknown entity kind: {kind}")

    return _validate(updated)


def delete_entity(scenario: Scenario, kind: str, entity_id: str) -> Scenario:
    updated = scenario.model_copy(deep=True)

    if kind == "building":
        updated.buildings = [b for b in updated.buildings if b.id != entity_id]
        removed_rooms = {r.id for r in updated.rooms if r.building_id == entity_id}
        updated.rooms = [r for r in updated.rooms if r.building_id != entity_id]
        updated.room_blackouts = [
            b for b in updated.room_blackouts if b.room_id not in removed_rooms
        ]
        updated.distances.pop(entity_id, None)
        for distances in updated.distances.values():
            distances.pop(entity_id, None)
    elif kind in ("room", "hall"):
        updated.rooms = [r for r in updated.rooms if r.id != entity_id]
        updated.room_blackouts = [b for b in updated.room_blackouts if b.room_id != entity_id]
        updated.room_pins = {
            section: room for section, room in updated.room_pins.items() if room != entity_id
        }
    elif kind == "instructor":
        updated.instructors = [i for i in updated.instructors if i.id != entity_id]
        updated.instructor_pins = {
            section: instructor
            for section, instructor in updated.instructor_pins.items()
            if instructor != entity_id
        }
    elif kind == "cohort":
        updated.cohorts = [c for c in updated.cohorts if c.id != entity_id]
    elif kind == "program":
        updated.programs = [p for p in updated.programs if p.id != entity_id]
        updated.cohorts = [c for c in updated.cohorts if c.program_id != entity_id]
    elif kind == "course":
        removed_sections = {s.id for s in updated.sections if s.course_id == entity_id}
        updated.courses = [c for c in updated.courses if c.id != entity_id]
        updated.sections = [s for s in updated.sections if s.course_id != entity_id]
        updated.active_enrollment = {
            section: value
            for section, value in updated.active_enrollment.items()
            if section not in removed_sections
        }
        updated.instructor_pins = {
            section: instructor
            for section, instructor in updated.instructor_pins.items()
            if section not in removed_sections
        }
        updated.room_pins = {
            section: room
            for section, room in updated.room_pins.items()
            if section not in removed_sections
        }
    elif kind == "section":
        updated.sections = [s for s in updated.sections if s.id != entity_id]
        updated.active_enrollment.pop(entity_id, None)
        updated.instructor_pins.pop(entity_id, None)
        updated.room_pins.pop(entity_id, None)
    elif kind == "closure":
        index = int(entity_id)
        if index < 0 or index >= len(updated.closures):
            raise ValueError("Closure not found.")
        updated.closures = [
            closure for i, closure in enumerate(updated.closures) if i != index
        ]
    else:
        raise ValueError(f"Unknown entity kind: {kind}")

    return _validate(updated)
