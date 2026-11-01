"""Core data contract: academic course timetabling.

The world a department scheduler actually faces every term:

- Instructors with hard schedules, soft preferences, load and prep caps
- Cohorts identified by admission year / expected graduation / current term
  index, whose position on a degree roadmap determines what MUST be offered
- A fixed inventory of rooms across campus buildings with a walk-distance
  matrix (a 15-minute sprint between buildings breaks back-to-back classes)
- Course sections with fixed meeting patterns (MWF / TTh / weekly lab block)

Flat and recursion-free by design (Meta Model API rejects recursive JSON
schemas; flat schemas are more reliable for structured output).
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
# Four 1.5-hour slots: 8:00, 9:30, 11:00, 12:30.
# A 1.5h course occupies one slot; a 3h course occupies two consecutive slots
# (the weekly "block" occupies periods 2 and 3 = 11:00–14:00).
PERIOD_NAMES = ["8:00", "9:30", "11:00", "12:30"]

# A weekly 3h block occupies two consecutive afternoon slots, on one of these days.
BLOCK_DAYS = [1, 2, 3]
BLOCK_PERIODS = [2, 3]

PATTERN_DAYS: dict[str, list[int]] = {"MWF": [0, 2, 4], "TTh": [1, 3]}

# Session length in hours, by pattern. Every class is a full 1.5h or a full
# 3h contiguous block — never 1h and never split.
PATTERN_DURATION: dict[str, float] = {"MWF": 1.5, "TTh": 1.5, "block": 3.0}


def period_start_time(period: int) -> str:
    """Clock time a slot starts (e.g. period 2 -> "11:00")."""
    return PERIOD_NAMES[period]


def period_end_time(period: int, duration_hours: float) -> str:
    """Clock time a session ends, given its start period and length."""
    h, m = PERIOD_NAMES[period].split(":")
    total = int(h) * 60 + int(m) + int(round(duration_hours * 60))
    return f"{total // 60}:{total % 60:02d}"

RoomType = Literal["lecture", "lab", "seminar"]
Pattern = Literal["MWF", "TTh", "block"]


class Building(BaseModel):
    id: str
    name: str
    campus: str = "Main Campus"


class Room(BaseModel):
    id: str
    name: str
    building_id: str
    capacity: int
    room_type: RoomType
    equipment: list[str] = []  # projector, computers, lecture-capture, video-conf, ...


class RoomBlackout(BaseModel):
    room_id: str
    day: int = Field(ge=0, le=4)
    period: Optional[int] = Field(default=None, ge=0, le=3)  # None = whole day


class SlotRef(BaseModel):
    day: int = Field(ge=0, le=4)
    period: int = Field(ge=0, le=3)


class InstructorPreference(BaseModel):
    kind: Literal["prefer", "avoid"]
    day: Optional[int] = Field(default=None, ge=0, le=4)
    period: Optional[int] = Field(default=None, ge=0, le=3)
    course_id: Optional[str] = None
    weight: int = 10


class Instructor(BaseModel):
    id: str
    name: str
    qualified_courses: list[str]
    max_sections: int = 2
    max_preps: int = 2
    hard_unavailable: list[SlotRef] = []
    preferences: list[InstructorPreference] = []


class Course(BaseModel):
    id: str
    code: str
    title: str
    pattern: Pattern
    room_type: RoomType
    seats: int  # minimum room capacity needed (per-section enrollment)
    equipment: list[str] = []  # required equipment subset of Room.equipment
    duration: float = 1.5  # session length in hours (1.5 or 3.0)

    def duration_hours(self) -> float:
        return self.duration or PATTERN_DURATION.get(self.pattern, 1.5)


class Section(BaseModel):
    id: str
    course_id: str


class RoadmapRequirement(BaseModel):
    """A degree-map entry: required course or elective-pool pick.

    Electives drive *estimated* demand (take-up), not full cohort size.
    """

    course_id: str
    required: bool = True
    seat_estimate: Optional[int] = None  # elective expected take-up


class Program(BaseModel):
    id: str
    name: str
    roadmap: dict[str, list[RoadmapRequirement]]  # "term index" -> requirements
    kind: Literal["major", "minor"] = "major"
    degree: str = "BSc"
    department: str = ""


class Cohort(BaseModel):
    """How far along a cohort is decides what must be offered this term."""

    id: str
    program_id: str
    name: str
    admission_year: int
    graduation_year: int
    current_term: int = Field(ge=0)
    size: int


class TermClosure(BaseModel):
    """A campus closure (holiday, reading day, shutdown): no section may be
    scheduled on that weekday, or in that period of it. The timetable is a
    weekly pattern, so closures are weekday-shaped by construction."""

    day: int = Field(ge=0, le=4)
    period: Optional[int] = Field(default=None, ge=0, le=3)  # None = all day
    label: str = "Closure"


class Scenario(BaseModel):
    name: str
    buildings: list[Building]
    rooms: list[Room]
    instructors: list[Instructor]
    courses: list[Course]
    sections: list[Section]
    programs: list[Program]
    cohorts: list[Cohort]
    distances: dict[str, dict[str, int]]  # building_id -> building_id -> walk minutes
    room_blackouts: list[RoomBlackout] = []
    closures: list[TermClosure] = []  # holidays / campus closures (all rooms)
    walk_limit_min: int = 10  # max walk between back-to-back classes
    active_enrollment: dict[str, int] = {}  # section_id -> registered count (post add/drop)
    # Durable decisions from applied requests (the "world state" after a
    # coordinator accepts a proposal): section_id -> instructor / room.
    instructor_pins: dict[str, str] = Field(default_factory=dict)
    room_pins: dict[str, str] = Field(default_factory=dict)

    # --- lookups -----------------------------------------------------------
    def course(self, course_id: str) -> Course:
        return next(c for c in self.courses if c.id == course_id)

    def course_code(self, course_id: str) -> str:
        return self.course(course_id).code

    def sections_of_course(self, course_id: str) -> list[Section]:
        return [s for s in self.sections if s.course_id == course_id]

    def instructor(self, instructor_id: str) -> Instructor:
        return next(i for i in self.instructors if i.id == instructor_id)

    def room(self, room_id: str) -> Room:
        return next(r for r in self.rooms if r.id == room_id)

    def section_by_id(self, section_id: str) -> Section:
        return next(s for s in self.sections if s.id == section_id)

    # --- demand ------------------------------------------------------------
    def _term_requirements(self, cohort: Cohort) -> list[RoadmapRequirement]:
        program = next(p for p in self.programs if p.id == cohort.program_id)
        return program.roadmap.get(str(cohort.current_term), [])

    def cohort_term_courses(self, cohort: Cohort) -> list[str]:
        return [r.course_id for r in self._term_requirements(cohort)]

    def enrollment_for_section(self, section: Section) -> int:
        """Projected or active enrollment. Active enrollment (post
        registration) always overrides the roadmap projection (C37)."""
        if section.id in self.active_enrollment:
            return self.active_enrollment[section.id]
        course = self.course(section.course_id)
        demand = 0
        for c in self.cohorts:
            for req in self._term_requirements(c):
                if req.course_id != course.id:
                    continue
                if req.required:
                    demand += c.size
                else:  # elective: estimated take-up (C35)
                    demand += req.seat_estimate or int(c.size * 0.4)
        return demand // max(1, len(self.sections_of_course(course.id)))

    def demanded_section_pairs(self) -> list[tuple[Section, Section]]:
        """Section pairs that some cohort needs simultaneously (C7)."""
        pairs: list[tuple[Section, Section]] = []
        needed = {
            c.id: {s.id for cid in self.cohort_term_courses(c)
                   for s in self.sections_of_course(cid)}
            for c in self.cohorts
        }
        for c in self.cohorts:
            ids = sorted(needed[c.id])
            for i, a in enumerate(ids):
                for b in ids[i + 1:]:
                    sa = next(s for s in self.sections if s.id == a)
                    sb = next(s for s in self.sections if s.id == b)
                    pairs.append((sa, sb))
        # dedupe across cohorts
        seen: set[tuple[str, str]] = set()
        out = []
        for sa, sb in pairs:
            key = (min(sa.id, sb.id), max(sa.id, sb.id))
            if key not in seen:
                seen.add(key)
                out.append((sa, sb))
        return out


class Operation(BaseModel):
    """One structured edit extracted from natural language.

    Muse Spark emits these via structured output; Pydantic validates before
    anything touches the solver. `explanation` goes to the UI change log.
    """

    op: Literal[
        "add_instructor_unavailability",
        "add_instructor_preference",
        "add_room_unavailability",
        "add_term_closure",
        "remove_instructor",
        "set_section_instructor",
        "set_section_room",
        "set_prep_cap",
        "set_load_cap",
        "update_enrollment",
    ]
    instructor_id: Optional[str] = None
    section_id: Optional[str] = None
    room_id: Optional[str] = None
    course_id: Optional[str] = None  # course preference
    day: Optional[int] = Field(default=None, ge=0, le=4)
    period: Optional[int] = Field(default=None, ge=0, le=3)
    kind: Optional[Literal["prefer", "avoid"]] = None
    weight: Optional[int] = None
    value: Optional[int] = None  # update_enrollment / set_*_cap: new number
    label: Optional[str] = None  # add_term_closure: holiday/closure name
    explanation: str


class ParsedRequest(BaseModel):
    """Structured-output contract for the Muse Spark parsing call."""

    summary: str
    operations: list[Operation]
