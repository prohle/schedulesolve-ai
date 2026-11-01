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
PERIOD_COUNT = len(PERIOD_NAMES)

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
FacultyTrack = Literal["research", "teaching"]
StudentLevel = Literal["bachelor", "master", "phd"]
OfferingStatus = Literal["offered", "not_offered", "dormant", "special_topic"]


class AcademicPolicy(BaseModel):
    """Coordinator-owned academic rules. Never a constant in solver code.

    Load is student-credit load, not a section count: a 3-credit course with
    40 students is 3 load units; 80 students is deliberately sub-linear
    (``credits * (enrollment / 40) ** exponent``), so a large lecture is not
    priced as two independent classes.
    """

    min_courses_full_time: int = 4
    min_credits_full_time: int = 12
    load_exponent: float = Field(default=0.7, ge=0.0, le=1.0)
    load_multiplier: float = Field(default=1.0, gt=0)
    # 30 units = roughly three 180-student lectures or four 40-student
    # classes; research track is 75% of that. Coordinators override both.
    full_time_faculty_load: float = Field(default=30.0, gt=0)
    research_track_factor: float = Field(default=0.75, gt=0)
    teaching_track_factor: float = Field(default=1.0, gt=0)
    phd_max_students_per_fall: int = Field(default=5, ge=1, le=20)
    phd_min_credits: int = Field(default=1, ge=1, le=6)
    phd_max_credits: int = Field(default=3, ge=1, le=12)

    def is_full_time(self, courses: int, credits: int) -> bool:
        return courses >= self.min_courses_full_time or credits >= self.min_credits_full_time

    def faculty_load_cap(self, track: FacultyTrack) -> float:
        factor = (self.research_track_factor if track == "research"
                  else self.teaching_track_factor)
        return self.full_time_faculty_load * factor

    def section_load_units(self, enrollment: int, credits: int) -> float:
        return (credits * (max(1, enrollment) / 40.0) ** self.load_exponent
                * self.load_multiplier)


class TimePeriod(BaseModel):
    start: str          # "08:30"
    end: str            # "09:20"
    minutes: int        # 50 = 50 minutes class + 10 minutes walk


class MeetingPattern(BaseModel):
    """One allowed meeting shape for a course.

    ``weekly`` patterns meet on fixed days at a chosen period (MWF, TTh).
    ``block`` patterns meet on one chosen day across fixed periods (a 3h lab).
    The coordinator edits the catalog; the solver enumerates it.
    """

    name: str
    kind: Literal["weekly", "block"] = "weekly"
    days: list[int] = []             # weekly: meeting days; block: allowed days
    periods: list[int] = []          # block: occupied periods
    duration_hours: float = 1.5
    credits: Optional[int] = None
    label: str = ""


def _default_periods() -> list[TimePeriod]:
    return [
        TimePeriod(start="08:00", end="09:30", minutes=90),
        TimePeriod(start="09:30", end="11:00", minutes=90),
        TimePeriod(start="11:00", end="12:30", minutes=90),
        TimePeriod(start="12:30", end="14:00", minutes=90),
    ]


def _default_patterns() -> list[MeetingPattern]:
    return [
        MeetingPattern(name="MWF", days=[0, 2, 4], duration_hours=1.5),
        MeetingPattern(name="TTh", days=[1, 3], duration_hours=1.5),
        MeetingPattern(name="block", kind="block", days=[1, 2, 3],
                       periods=[2, 3], duration_hours=3.0),
    ]


class TimeGrid(BaseModel):
    """The university's teaching day, editable by the coordinator.

    ``periods`` is the base slot grid (start/end/minutes). ``patterns`` is the
    catalog of meeting shapes a course may use. The default reproduces the
    historical four 90-minute slots; a coordinator can set 08:30-21:00, 50/80/
    170-minute patterns, or a different day set without code changes.
    """

    day_start: str = "08:00"
    day_end: str = "21:00"
    periods: list[TimePeriod] = Field(default_factory=_default_periods)
    patterns: list[MeetingPattern] = Field(default_factory=_default_patterns)
    allowed_durations_min: list[int] = Field(default_factory=lambda: [50, 80, 170])

    @property
    def period_count(self) -> int:
        return len(self.periods)

    def pattern(self, name: str) -> MeetingPattern:
        for p in self.patterns:
            if p.name == name:
                return p
        raise KeyError(f"unknown meeting pattern {name!r}")

    def pattern_days(self, name: str) -> list[int]:
        return list(self.pattern(name).days)

    def pattern_periods(self, name: str, key: int | None = None) -> list[int]:
        p = self.pattern(name)
        if p.kind == "block":
            return list(p.periods)
        return [key] if key is not None else []

    def pattern_slots(self, name: str, key: int) -> set[tuple[int, int]]:
        p = self.pattern(name)
        if p.kind == "block":
            return {(key, period) for period in p.periods}
        return {(day, key) for day in p.days}

    def pattern_keys(self, name: str) -> list[int]:
        p = self.pattern(name)
        if p.kind == "block":
            return sorted(p.days or BLOCK_DAYS)
        return list(range(self.period_count))


class CourseOffering(BaseModel):
    """A term-scoped catalog decision, kept as a durable record.

    Catalog courses can be dormant for years (``dormant``), explicitly not
    taught this term (``not_offered``), or opened as a one-off special topic
    (``special_topic``). The coordinator's reason and timestamp are part of
    the record; the solver only schedules ``offered``/``special_topic``
    sections.
    """

    course_id: str
    term: str = "current"
    status: OfferingStatus = "offered"
    reason: str = ""
    department: str = ""
    recorded_by: str = ""
    recorded_at: Optional[str] = None


class Student(BaseModel):
    """An individual student (needed for PhD reservations and personal plans)."""

    id: str
    name: str
    level: StudentLevel = "bachelor"
    program_id: str
    cohort_id: Optional[str] = None
    entry_year: int = 2026
    credits_completed: int = 0
    completed_course_ids: list[str] = []
    preferred_days: list[int] = []
    preferred_periods: list[int] = []
    campus_days: list[int] = []       # days the student is willing to come to campus
    max_courses_per_term: Optional[int] = None


class PhDReservation(BaseModel):
    """A 1-3 credit PhD reading/research course reserved with a supervisor.

    A professor accepts at most ``max_phd_students`` new PhD students each
    Fall (default 3, policy ceiling 5). Entry is always a Fall term.
    """

    id: str
    student_id: str
    instructor_id: str
    course_id: str
    credits: int = Field(default=3, ge=1, le=3)
    term: str = "current"
    status: Literal["requested", "approved", "rejected"] = "requested"
    note: str = ""


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
    period: Optional[int] = Field(default=None, ge=0, le=PERIOD_COUNT - 1)  # None = whole day


class SlotRef(BaseModel):
    day: int = Field(ge=0, le=4)
    period: int = Field(ge=0, le=PERIOD_COUNT - 1)


class InstructorPreference(BaseModel):
    kind: Literal["prefer", "avoid"]
    day: Optional[int] = Field(default=None, ge=0, le=4)
    period: Optional[int] = Field(default=None, ge=0, le=PERIOD_COUNT - 1)
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
    track: FacultyTrack = "research"
    # Student-credit load cap (load units). None -> policy.faculty_load_cap(track).
    max_student_load: Optional[float] = None
    accepts_phd: bool = False
    max_phd_students: int = Field(default=3, ge=0, le=20)


class Course(BaseModel):
    id: str
    code: str
    title: str
    pattern: Pattern
    room_type: RoomType
    seats: int  # minimum room capacity needed (per-section enrollment)
    equipment: list[str] = []  # required equipment subset of Room.equipment
    duration: float = 1.5  # session length in hours (1.5 or 3.0)
    credits: int = 3
    catalog_status: Literal["active", "dormant", "retired"] = "active"
    is_special_topic: bool = False
    department: str = ""

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
    level: StudentLevel = "bachelor"
    credits_per_term: int = 15
    # Fall intake: 1, 3, 5, 7. Kept explicit so a mid-year transfer is visible.
    entry_term: int = 1


class TermClosure(BaseModel):
    """A campus closure (holiday, reading day, shutdown): no section may be
    scheduled on that weekday, or in that period of it. The timetable is a
    weekly pattern, so closures are weekday-shaped by construction."""

    day: int = Field(ge=0, le=4)
    period: Optional[int] = Field(default=None, ge=0, le=PERIOD_COUNT - 1)  # None = all day
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
    # Coordinator-owned policy, calendar-facing grid, and durable records.
    policy: AcademicPolicy = Field(default_factory=AcademicPolicy)
    time_grid: TimeGrid = Field(default_factory=TimeGrid)
    course_offerings: list[CourseOffering] = []
    students: list[Student] = []
    phd_reservations: list[PhDReservation] = []

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

    # --- offering status / meeting grid -----------------------------------
    def offering(self, course_id: str) -> CourseOffering | None:
        return next((o for o in self.course_offerings if o.course_id == course_id), None)

    def is_offered(self, course_id: str) -> bool:
        """Catalog status + term decision. Dormant/retired courses never run."""
        course = next((c for c in self.courses if c.id == course_id), None)
        if course is None or course.catalog_status in ("dormant", "retired"):
            return False
        record = self.offering(course_id)
        return record is None or record.status in ("offered", "special_topic")

    def offered_sections(self) -> list[Section]:
        return [s for s in self.sections if self.is_offered(s.course_id)]

    def pattern(self, name: str) -> MeetingPattern:
        return self.time_grid.pattern(name)

    def pattern_days(self, name: str) -> list[int]:
        return self.time_grid.pattern_days(name)

    def pattern_periods(self, name: str, key: int | None = None) -> list[int]:
        return self.time_grid.pattern_periods(name, key)

    def pattern_slots(self, name: str, key: int) -> set[tuple[int, int]]:
        return self.time_grid.pattern_slots(name, key)

    def pattern_keys(self, name: str) -> list[int]:
        return self.time_grid.pattern_keys(name)

    # --- load / full-time --------------------------------------------------
    def section_load_units(self, section: Section) -> float:
        course = self.course(section.course_id)
        return self.policy.section_load_units(
            self.enrollment_for_section(section), course.credits)

    def instructor_load_cap(self, instructor: Instructor) -> float:
        if instructor.max_student_load is not None:
            return instructor.max_student_load
        return self.policy.faculty_load_cap(instructor.track)

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
    period: Optional[int] = Field(default=None, ge=0, le=PERIOD_COUNT - 1)
    kind: Optional[Literal["prefer", "avoid"]] = None
    weight: Optional[int] = None
    value: Optional[int] = None  # update_enrollment / set_*_cap: new number
    label: Optional[str] = None  # add_term_closure: holiday/closure name
    explanation: str


class ParsedRequest(BaseModel):
    """Structured-output contract for the Muse Spark parsing call."""

    summary: str
    operations: list[Operation]
