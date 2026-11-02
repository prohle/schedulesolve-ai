"""Deterministic normalizer: Muse-extracted entities -> solver Scenario.

Muse autocleans; this assembles. All ids are slugified deterministically so the
resulting scenario solves identically every run (no hallucinated ids reach the
solver). Missing pieces get sensible defaults so a partial extraction still
schedules.
"""

from __future__ import annotations

import re

from app.models.ingestion import InstitutionData
from app.models.scenario import (
    Building,
    Cohort,
    Course,
    Instructor,
    InstructorPreference,
    PATTERN_DURATION,
    PERIOD_COUNT,
    Program,
    RoadmapRequirement,
    Room,
    Scenario,
    Section,
    SlotRef,
)

DEFAULT_WALK_MIN = 5  # between distinct buildings when no campus map is given

_DAY_WORDS = {
    "monday": 0, "mondays": 0, "tuesday": 1, "tuesdays": 1,
    "wednesday": 2, "wednesdays": 2, "thursday": 3, "thursdays": 3,
    "friday": 4, "fridays": 4,
}
_PERIOD_WORDS = {
    "morning": 0, "mornings": 0, "8:00": 0, "8am": 0, "before 10": 0,
    "10:00": 1, "10am": 1,
    "afternoon": 2, "afternoons": 2, "1:00": 2, "1pm": 2,
    "3:00": 3, "3pm": 3,
}
_HARD_RE = re.compile(r"\b(?:unavailable|can'?t|cannot|not available|no|blocked|avoid)\b")
_SOFT_RE = re.compile(r"\b(?:prefer|prefers|rather|like|likes)\b")


def _availability(text: str) -> tuple[list[SlotRef], list[InstructorPreference]]:
    """Turn a free-form availability note into typed slots/preferences.

    Heuristic on purpose: the live Muse extraction keeps the note as text, and
    this normalizer is the deterministic bridge to the solver. Unknown phrasing
    is ignored rather than guessed.
    """
    low = (text or "").lower()
    hard: list[SlotRef] = []
    prefs: list[InstructorPreference] = []
    if not low:
        return hard, prefs

    for clause in re.split(r"[;,.]", low):
        if not clause.strip():
            continue
        is_hard = bool(_HARD_RE.search(clause))
        is_soft = bool(_SOFT_RE.search(clause))
        if not (is_hard or is_soft):
            continue

        for word, day in _DAY_WORDS.items():
            if not re.search(rf"\b{word}\b", clause):
                continue
            if is_hard:
                hard.extend(SlotRef(day=day, period=p) for p in range(PERIOD_COUNT))
            else:
                prefs.append(InstructorPreference(kind="prefer", day=day))

        for word, period in _PERIOD_WORDS.items():
            if not re.search(rf"\b{re.escape(word)}\b", clause):
                continue
            if is_hard:
                hard.extend(SlotRef(day=d, period=period) for d in range(5))
            else:
                prefs.append(InstructorPreference(kind="prefer", period=period))

    return hard, prefs


def slug(s: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return s or "x"


def _pattern(p: str) -> str:
    u = p.strip().upper()
    return "block" if u == "BLOCK" else ("TTh" if u == "TTH" else "MWF")


def _room_type(t: str) -> str:
    t = t.strip().lower()
    return t if t in ("lecture", "lab", "seminar") else "lecture"


def build_scenario(data: InstitutionData) -> Scenario:
    # Duplicate records (same slug id) collapse to the first copy. Records
    # that merely share an id but *disagree* are a data conflict: the
    # ingestion layer (app.ingestion.conflicts) flags them with their
    # sources and the user elects the winner before this builder runs on
    # the reviewed data — the first-wins collapse here only keeps an
    # unreviewed preview buildable, it never invents a new record.
    # --- buildings ----------------------------------------------------------
    names: list[str] = list(dict.fromkeys(data.buildings))
    for r in data.rooms:
        if r.building and r.building not in names:
            names.append(r.building)
    if not names:
        names = ["Main Campus"]
    buildings = [Building(id=slug(b), name=b) for b in names]

    # --- courses + sections -------------------------------------------------
    courses: list[Course] = []
    sections: list[Section] = []
    code_to_id: dict[str, str] = {}
    for c in data.courses:
        cid = slug(c.code) or f"course-{len(courses)}"
        if cid in {existing.id for existing in courses}:
            continue  # duplicate record: first copy wins (see note above)
        code_to_id[c.code.strip()] = cid
        code_to_id[slug(c.code)] = cid
        courses.append(Course(
            id=cid, code=c.code.strip(), title=c.title or c.code,
            pattern=_pattern(c.pattern), room_type=_room_type(c.room_type), seats=c.seats,
            equipment=c.equipment, duration=PATTERN_DURATION.get(_pattern(c.pattern), 1.5),
        ))
        sections.append(Section(id=f"sec-{cid}", course_id=cid))

    # --- instructors --------------------------------------------------------
    def resolve_code(code: str) -> str:
        return code_to_id.get(code.strip()) or code_to_id.get(slug(code), "")

    instructors: list[Instructor] = []
    for inst in data.instructors:
        iid = slug(inst.name) or f"instructor-{len(instructors)}"
        if iid in {existing.id for existing in instructors}:
            continue  # duplicate record: first copy wins (see note above)
        qualified = [c for c in (resolve_code(q) for q in inst.qualified_courses) if c]
        hard, prefs = _availability(inst.availability)
        instructors.append(Instructor(
            id=iid, name=inst.name, qualified_courses=qualified,
            max_sections=inst.max_sections, max_preps=inst.max_preps,
            hard_unavailable=hard, preferences=prefs,
        ))

    # --- rooms --------------------------------------------------------------
    rooms: list[Room] = []
    for r in data.rooms:
        if slug(r.name) in {existing.id for existing in rooms}:
            continue  # duplicate record: first copy wins (see note above)
        b = slug(r.building) if r.building else buildings[0].id
        rooms.append(Room(
            id=slug(r.name), name=r.name, building_id=b, capacity=r.capacity,
            room_type=_room_type(r.room_type), equipment=r.equipment,
        ))

    # --- programs / degree maps ----------------------------------------------
    program_names = list(dict.fromkeys(
        [c.program for c in data.cohorts if c.program] +
        [req.program for req in data.degree_map if req.program]
    )) or ["default"]
    programs: list[Program] = []
    for pname in program_names:
        roadmap: dict[str, list[RoadmapRequirement]] = {}
        for req in data.degree_map:
            if req.program and req.program != pname:
                continue
            cid = resolve_code(req.course)
            if not cid:
                continue
            entries = roadmap.setdefault(str(req.term), [])
            if any(entry.course_id == cid for entry in entries):
                continue  # duplicate entry: first copy wins (see note above)
            entries.append(
                RoadmapRequirement(course_id=cid, required=req.required))
        programs.append(Program(id=slug(pname), name=pname, roadmap=roadmap))

    # --- cohorts ------------------------------------------------------------
    cohorts: list[Cohort] = []
    for c in data.cohorts:
        if (slug(c.name) or "") in {existing.id for existing in cohorts} and c.name:
            continue  # duplicate record: first copy wins (see note above)
        prog = slug(c.program) if c.program else programs[0].id
        cohorts.append(Cohort(
            id=slug(c.name) or f"cohort-{len(cohorts)}", program_id=prog,
            name=c.name or f"Cohort {len(cohorts) + 1}",
            admission_year=c.admission_year, graduation_year=c.graduation_year,
            current_term=c.current_term, size=c.size,
        ))

    # --- distances (default walk matrix; campus-map hints can refine later) ---
    distances: dict[str, dict[str, int]] = {}
    for b1 in buildings:
        row: dict[str, int] = {}
        for b2 in buildings:
            row[b2.id] = 0 if b1.id == b2.id else DEFAULT_WALK_MIN
        distances[b1.id] = row
    for d in data.distances:
        a, b = slug(d.from_building), slug(d.to_building)
        if a in distances and b in distances[a] and a != b:
            minutes = max(0, d.minutes)
            distances[a][b] = minutes
            distances[b][a] = minutes

    return Scenario(
        name="Ingested scenario", buildings=buildings, rooms=rooms,
        instructors=instructors, courses=courses, sections=sections,
        programs=programs, cohorts=cohorts, distances=distances,
        room_blackouts=[], walk_limit_min=10, active_enrollment={},
    )