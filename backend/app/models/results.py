"""Result types: timetable, conflict reports, and term-change reassignment proposals."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel


class Placement(BaseModel):
    """Where one section landed: instructor, timeslot(s), room."""

    section_id: str
    course_id: str
    course_code: str
    instructor_id: str
    instructor_name: str
    days: list[int]          # meeting days
    period: Optional[int]    # one-period patterns; None for blocks
    periods: list[int]       # occupied periods (1 or 2 entries)
    duration: float = 1.5    # session length in hours (1.5 or 3.0)
    enrollment: int = 0      # class size (active/projected)
    start_time: str = ""     # clock time, e.g. "8:00"
    end_time: str = ""       # clock time, e.g. "9:30"
    room_id: str
    room_name: str
    building_id: str


class Timetable(BaseModel):
    placements: list[Placement]
    sections_per_instructor: dict[str, int]


def operation_source(op) -> str:  # noqa: ANN001 — an Operation
    """One line naming where a conflicting request came from."""
    src = (getattr(op, "source", "") or "").strip() or "the submitted request"
    return f"'{op.explanation}' — source: {src}"


class ConflictReport(BaseModel):
    """Minimal conflicting subset of the requested operations (CP-SAT IIS)."""

    conflicting_operation_indices: list[int]
    explanation: str
    suggestion: str
    # One entry per conflicting index, naming the request and the source it
    # came from (speaker / intake submission / institution model), so the
    # user can see *whose* information created the conflict before electing
    # what wins.
    sources: list[str] = []


class SolveResult(BaseModel):
    status: Literal["optimal", "feasible", "infeasible", "unknown"]
    timetable: Optional[Timetable] = None
    objective: Optional[int] = None
    objective_name: str = "preference"   # preference | balanced_load | room_fit
    conflicts: Optional[ConflictReport] = None
    solve_time_ms: int


class CompareResult(BaseModel):
    """Side-by-side: CP-SAT vs ScheduleSolve's own solver on the same world."""

    cpsat: SolveResult
    ours: SolveResult
    same_status: bool
    agreement_pct: Optional[float] = None   # share of sections placed identically
    differing_sections: list[str] = []
    objective_delta: Optional[int] = None   # ours - cpsat (preference penalty)
    speed_ratio: Optional[float] = None     # ours_ms / cpsat_ms (>1 = CP-SAT faster)
    winner: Optional[str] = None            # engine id ranked first, or "tie"
    verdict: Optional[str] = None           # why, from outputs only


class CandidateProposal(BaseModel):
    """One instructor's CP-SAT-verified viability for covering a section."""

    section_id: str
    course_code: str
    instructor_id: str
    instructor_name: str
    feasible: bool
    objective_delta: Optional[int] = None
    load_after: Optional[int] = None
    reason: str
    # Where the candidacy came from (faculty roster + published timetable),
    # so the coordinator can see the source before electing who covers.
    source: str = ""


class Resolution(BaseModel):
    """One Muse-proposed fix: drop exactly one conflicting request."""

    drop_operation_index: int
    tradeoff: str


class ExplanationResult(BaseModel):
    """Structured-output contract for the Muse Spark explanation call."""

    explanation: str
    resolutions: list[Resolution]


class ResolutionOption(BaseModel):
    """A resolution Muse proposed AND CP-SAT re-solved successfully."""

    dropped_operation_index: int
    dropped_explanation: str
    tradeoff: str
    result: SolveResult
    # Provenance of the choice: the dropped request's source, the sources of
    # the conflicting requests it was weighed against, and the exact
    # operations that stand if the user elects this fix (so electing a
    # different winner never has to re-derive indices).
    source: str = ""
    sources: list[str] = []
    operations: list = []


class AgentStep(BaseModel):
    """One step of the autonomous co-pilot loop, in execution order.

    The agent acts in stages — parse, validate, solve, explain, verify,
    apply, audit — and this trace makes that loop visible to the coordinator
    (and to judges): who acted, what they did, and whether the solver
    approved it. `actor` is the component that ran the step, never a guess.
    """

    step: str        # parse | validate | solve | conflict-core | explain | verify | apply | probe | choose | re-solve | audit
    actor: str       # e.g. "Muse Spark", "CP-SAT", "Validator", "Audit trail"
    detail: str
    status: Literal["ok", "blocked", "info"] = "ok"


class TermChangeResponse(BaseModel):
    removed_instructor_id: str
    removed_instructor_name: str
    affected_section_ids: list[str]
    proposals: list[CandidateProposal]
    chosen: dict[str, str]           # section_id -> chosen instructor_id
    healing_notes: list[str]
    result: Optional[SolveResult] = None
    parser_mode: Literal["muse-spark", "mock"]
    model: Optional[str] = None
    parser_latency_ms: Optional[int] = None
    transcript: Optional[str] = None
    agent_trace: list[AgentStep] = []


class StudentConstraints(BaseModel):
    """Structured-output contract for the Muse Spark student-request parse.

    A student describes their life ("I work Tue/Thu, I need CS 201, no 8 AMs")
    and gets back typed constraints a selector can prove against.
    """

    summary: str = ""
    must_course_ids: list[str] = []
    completed_course_ids: list[str] = []  # "I've already passed CS 101..."
    avoid_days: list[int] = []      # days the student cannot attend at all
    avoid_periods: list[int] = []   # periods (0-3) the student cannot attend
    preferred_days: list[int] = []  # soft: days the student prefers to visit campus
    preferred_periods: list[int] = []  # soft: periods the student prefers
    prefer_morning: bool = False
    prefer_afternoon: bool = False
    target_courses: int = 4


class StudentProgress(BaseModel):
    """Where one student stands in their desired degree — from their record."""

    source: str                     # provided record | cohort progress lookup
    program_id: str
    program_name: str
    completed_course_ids: list[str] = []
    required_total: int = 0         # mandatory courses in the degree map
    required_completed: int = 0
    pct_complete: int = 0
    mandatory_ready: list[str] = []   # course codes: remaining + eligible now
    mandatory_co_ready: list[str] = []  # eligible if a gating course is co-taken
    mandatory_locked: list[str] = []  # course codes: earlier courses unfinished
    optional_remaining: int = 0
    projected_graduation: str = ""
    expected_graduation: str = ""
    projection_status: Literal["on_track", "delayed", "complete"] = "on_track"
    projection_note: str = ""
    graduation_delay_terms: int = 0
    projection_course: str = ""


class StudentPlanConflict(BaseModel):
    """Contradictory inputs the student must arbitrate.

    Advising never silently picks a side. When the record disagrees with the
    cohort lookup, or a must-take course only meets inside a time the student
    marked unavailable, the response carries the conflict, the options, the
    default and — once the student chooses — the option that won.
    """

    kind: str                    # record_vs_lookup | must_already_completed | ...
    summary: str
    detail: str = ""
    options: list[str] = []      # machine choices the client sends back
    default_option: str = ""
    chosen_option: str = ""
    # One line per side, naming the source and what it says (the student's
    # record, the cohort lookup, the published timetable, the request), so
    # the student elects a winner knowing where each side came from.
    sources: list[str] = []


class StudentPlanCourse(BaseModel):
    """One suggested course: a concrete section that fits the student's life."""

    course_id: str
    course_code: str
    title: str
    section_id: str
    instructor_name: str
    days: list[int]
    period: Optional[int] = None
    start_time: str = ""
    end_time: str = ""
    room_name: str = ""
    required: bool = False          # on this term's degree-roadmap plan
    credits: int = 3
    reason: str = ""


class StudentPlanResponse(BaseModel):
    """A suggested personal schedule, verified conflict-free before shown."""

    cohort_id: Optional[str] = None
    cohort_name: str = ""
    constraints: StudentConstraints
    progress: Optional[StudentProgress] = None
    courses: list[StudentPlanCourse] = []
    target_courses: int = 4
    target_met: bool = False
    credits_selected: int = 0
    full_time: bool = False
    projected_graduation: str = ""
    expected_graduation: str = ""
    projection_status: Literal["on_track", "delayed", "complete"] = "on_track"
    projection_note: str = ""
    graduation_delay_terms: int = 0
    projection_course: str = ""
    notes: list[str] = []
    missing_inputs: list[str] = []   # what the student can supply to sharpen this
    conflicts: list[StudentPlanConflict] = []  # contradictions they must arbitrate
    parser_mode: Literal["muse-spark", "mock"]
    model: Optional[str] = None
    parser_latency_ms: Optional[int] = None
    agent_trace: list[AgentStep] = []


class CopilotResponse(BaseModel):
    summary: str
    operations: list = []
    applied_operations: list = []
    dropped_operations: list = []
    healing_notes: list[str] = []
    explanation: Optional[str] = None
    explanation_mode: Optional[str] = None
    options: list[ResolutionOption] = []
    # The solver's conflict report (indices + per-request sources) when the
    # request proved infeasible, and which verified option was auto-applied
    # as the least-disruptive default (the user may elect another option;
    # every option carries the operations that would stand instead).
    conflicts: Optional[ConflictReport] = None
    applied_option_index: Optional[int] = None
    result: Optional[SolveResult] = None
    parser_mode: Literal["muse-spark", "mock"]
    model: Optional[str] = None
    parser_latency_ms: Optional[int] = None
    agent_trace: list[AgentStep] = []
