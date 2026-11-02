"""AI tightening layer: Muse Spark proposes typed repairs, CP-SAT verifies.

Third runtime role for Muse Spark (after constraint parsing and infeasibility
explanation): when the solver deadlocks or the four-course offering guarantee
(C39) fails, the intelligence layer hands Muse the evidence — the spectral
deadlock warnings, the CP-SAT conflict core, the margin shortfalls, the load
board — and Muse proposes a small set of TYPED moves from a closed grammar:

  raise_load_cap(instructor)      contractual cap +1 (registrar approval)
  add_section(course)             split demand into another section (C5)
  add_qualification(instructor, course)  cross-training
  open_elective(cohort, course)   registrar adds an elective to a term plan
  drop_request(op_index)          withdraw one parsed request

The grammar is the safety envelope: a move cannot invent rooms, delete
sections, or touch anyone's hard constraints. Every move is verified before
it is shown — a full CP-SAT re-solve of the mutated scenario (and, for
open_elective, a recomputed C39 margin) — so Muse can propose boldly but
only solver-verified moves can be *elected and applied* (re-verified again
at apply time); rejected moves are returned labelled as rejected.

Frugal by default: a deterministic template generator plays the Muse role
whenever no API key is configured, so development and tests burn zero
credits while exercising the identical verification pipeline.
"""

from __future__ import annotations

import logging
from typing import Optional

from pydantic import BaseModel, Field

from app import config
from app.models.intelligence import (
    MarginsReport,
    TightenResponse,
    TighteningMove,
)
from app.models.results import SolveResult
from app.models.scenario import Operation, Program, RoadmapRequirement, Scenario, Section
from app.intelligence.matrices import cohort_pool, compute_margins
from app.intelligence.spectral import analyze
from app.services.audit import record_event
from app.solver.scheduling_model import solve

logger = logging.getLogger(__name__)


# --- move grammar -------------------------------------------------------------

class ProposedMove(BaseModel):
    """Structured-output contract for the Muse Spark tightening call."""

    kind: str = Field(pattern="^(raise_load_cap|add_section|add_qualification|open_elective|drop_request)$")
    instructor_id: Optional[str] = None
    course_id: Optional[str] = None
    cohort_id: Optional[str] = None
    op_index: Optional[int] = Field(default=None, ge=0)
    rationale: str = ""


class TighteningPlan(BaseModel):
    assessment: str
    moves: list[ProposedMove]


def _copy(scenario: Scenario) -> Scenario:
    return scenario.model_copy(deep=True)


def apply_move(scenario: Scenario, move: TighteningMove) -> Scenario:
    """Pure mutation of a deep copy — the only way a move touches the world."""
    sc = _copy(scenario)
    if move.kind == "raise_load_cap" and move.instructor_id:
        inst = next(i for i in sc.instructors if i.id == move.instructor_id)
        inst.max_sections += 1
    elif move.kind == "add_section" and move.course_id:
        k = 1 + len(sc.sections_of_course(move.course_id))
        sc.sections.append(Section(id=f"sec-{move.course_id}-x{k}", course_id=move.course_id))
    elif move.kind == "add_qualification" and move.instructor_id and move.course_id:
        inst = next(i for i in sc.instructors if i.id == move.instructor_id)
        if move.course_id not in inst.qualified_courses:
            inst.qualified_courses.append(move.course_id)
    elif move.kind == "open_elective" and move.cohort_id and move.course_id:
        cohort = next(c for c in sc.cohorts if c.id == move.cohort_id)
        program: Program = next(p for p in sc.programs if p.id == cohort.program_id)
        program.roadmap.setdefault(str(cohort.current_term), []).append(
            RoadmapRequirement(course_id=move.course_id, required=False, seat_estimate=None))
    return sc


def apply_moves(scenario: Scenario, moves: list[TighteningMove]) -> Scenario:
    sc = scenario
    for move in moves:
        sc = apply_move(sc, move)
    return sc


# --- verification --------------------------------------------------------------

def _re_solve(scenario: Scenario, ops: list[Operation], skip_index: Optional[int] = None) -> SolveResult:
    remaining = [o for i, o in enumerate(ops) if i != skip_index]
    return solve(scenario, remaining)


def verify_move(scenario: Scenario, ops: list[Operation], move: TighteningMove,
                base: SolveResult,
                baseline_margin: dict[str, int]) -> tuple[bool, str, Optional[SolveResult], Optional[MarginsReport]]:
    """Run the proposed move and judge it. (verified, detail, result, margins)

    For `open_elective` the margin gain is measured against the CURRENT board
    (the placements already on the wall) — the re-solve only proves the
    enlarged offering remains solvable, because CP-SAT optimizes preference
    penalties, not cohort margins, and a fresh re-placement could otherwise
    mask or fake the improvement.
    """
    if move.kind == "drop_request":
        if move.op_index is None or move.op_index >= len(ops):
            return False, "drop_request index out of range", None, None
        result = _re_solve(scenario, ops, move.op_index)
        ok = result.status in ("optimal", "feasible")
        return ok, (f"timetable re-solves {result.status.upper()} without request "
                    f"#{move.op_index}" if ok else "still infeasible without it"), result, None

    mutated = apply_move(scenario, move)
    if move.kind == "open_elective" and move.cohort_id:
        # margin delta judged on the current timetable (widened pool only)
        after_margins = compute_margins(mutated, base.timetable, config.MIN_COURSES_PER_COHORT)
        after = {m.cohort_id: m.margin for m in after_margins.cohorts}.get(move.cohort_id, 0)
        before = baseline_margin.get(move.cohort_id, 0)
        result = solve(mutated, ops)  # enlarged offering must stay solvable
        feasible = result.status in ("optimal", "feasible")
        ok = after > before and feasible
        detail = (f"margin {before} -> {after} against the current board; enlarged "
                  f"scenario re-solves {result.status.upper()}")
        return ok, detail, result, after_margins

    result = solve(mutated, ops)
    if result.status not in ("optimal", "feasible"):
        return False, "mutated scenario still infeasible — move rejected", result, None
    margins = compute_margins(mutated, result.timetable, config.MIN_COURSES_PER_COHORT)
    now = {m.cohort_id: m.margin for m in margins.cohorts}
    detail = "CP-SAT re-solves the mutated scenario " + result.status.upper()
    if margins.cohorts:
        detail += f"; four-course margins {now}"
    return True, detail, result, margins


# --- Muse Spark (or deterministic template) proposals ---------------------------

def _mode() -> str:
    return "muse-spark" if config.MUSE_API_KEY else "mock"


def _muse_plan(scenario: Scenario, evidence: list[str], ops: list[Operation],
               margins: MarginsReport, base: SolveResult) -> TighteningPlan | None:
    client = None
    if config.MUSE_API_KEY:
        from openai import OpenAI
        client = OpenAI(
            base_url=config.MUSE_BASE_URL, api_key=config.MUSE_API_KEY,
            timeout=config.MUSE_TIMEOUT_S)
    if client is None:
        return None
    try:
        response = client.beta.chat.completions.parse(
            model=config.MUSE_MODEL,
            messages=[
                {"role": "system", "content": _TIGHTENER_SYSTEM_PROMPT},
                {"role": "user", "content": _build_case_prompt(scenario, evidence, ops, margins, base)},
            ],
            response_format=TighteningPlan,
            reasoning_effort=config.MUSE_REASONING_EFFORT,
        )
        parsed: Optional[TighteningPlan] = response.choices[0].message.parsed
        if parsed is None:
            raise ValueError("model returned no tightening plan")
        return parsed
    except Exception:
        logger.exception("Muse Spark tightening failed; falling back to template")
        return None


def _validate_plan(plan: TighteningPlan, scenario: Scenario, ops: list[Operation],
                   core: list[int]) -> TighteningPlan:
    """The hallucination firewall: ids must exist, drop indices must sit in
    the CP-SAT conflict core, at most 3 moves survive."""
    instructor_ids = {i.id for i in scenario.instructors}
    course_ids = {c.id for c in scenario.courses}
    cohort_ids = {c.id for c in scenario.cohorts}
    moves: list[ProposedMove] = []
    for mv in plan.moves:
        if len(moves) >= 3:
            break
        if mv.kind == "raise_load_cap" and mv.instructor_id in instructor_ids:
            moves.append(mv)
        elif mv.kind == "add_section" and mv.course_id in course_ids:
            moves.append(mv)
        elif (mv.kind == "add_qualification" and mv.instructor_id in instructor_ids
              and mv.course_id in course_ids):
            moves.append(mv)
        elif (mv.kind == "open_elective" and mv.cohort_id in cohort_ids
              and mv.course_id in course_ids):
            cohort = next(c for c in scenario.cohorts if c.id == mv.cohort_id)
            _, pool = cohort_pool(scenario, cohort)
            if mv.course_id in set(pool):
                continue  # already eligible — a no-op the solver would reject
            moves.append(mv)
        elif (mv.kind == "drop_request" and mv.op_index is not None
              and 0 <= mv.op_index < len(ops) and mv.op_index in core):
            moves.append(mv)
    return TighteningPlan(assessment=plan.assessment, moves=moves)


def _courses_non_overlap(slots: dict[str, list[set]], c1: str, c2: str) -> bool:
    """True if some section of c1 and some section of c2 are disjoint (the
    student can take both)."""
    return any(not (a & b) for a in slots.get(c1, []) for b in slots.get(c2, []))


def _mock_assessment(base: SolveResult, margins: MarginsReport, core: list[int]) -> str:
    if core:
        return ("(template) The request set is infeasible — CP-SAT names a conflict "
                "core; withdrawing one request lets the timetable re-solve.")
    shortfall = [m for m in margins.cohorts if not m.ok]
    if base.status == "infeasible":
        return ("(template) The base scenario is infeasible; proposing structural "
                "repairs (load cap, qualification, section) that the solver can verify.")
    if shortfall:
        names = "; ".join(f"{m.name} ({m.margin}/{margins.min_courses})" for m in shortfall)
        return (f"(template) C39 four-course shortfalls: {names}. Proposing elective "
                f"openings from already-offered, conflict-free courses.")
    return "(template) No blocking issue — no moves proposed."


def _mock_plan(scenario: Scenario, evidence: list[str], base: SolveResult,
               margins: MarginsReport, ops: list[Operation], core: list[int]) -> TighteningPlan:
    """Deterministic template generator — same grammar, zero credits."""
    moves: list[ProposedMove] = []
    if core and ops:
        for i in core[:2]:
            moves.append(ProposedMove(
                kind="drop_request", op_index=i,
                rationale=f"Withdraw '{ops[i].explanation}' — it sits in the CP-SAT conflict core."))
    if base.status == "infeasible" and not core:
        loads = base.timetable.sections_per_instructor if base.timetable else {}
        for inst in scenario.instructors:
            if loads.get(inst.id, 0) >= inst.max_sections:
                moves.append(ProposedMove(
                    kind="raise_load_cap", instructor_id=inst.id,
                    rationale=f"{inst.name} is at the {inst.max_sections}-section cap "
                              f"while sections sit unscheduled."))
        for course in scenario.courses:
            offered = len(scenario.sections_of_course(course.id))
            if offered == 0 or any(
                    not any(course.id in i.qualified_courses for i in scenario.instructors)
                    for _ in [0]):
                qualified = [i for i in scenario.instructors
                             if course.id in i.qualified_courses]
                if not qualified:
                    donor = max(scenario.instructors,
                                key=lambda i: (len(i.qualified_courses), i.id))
                    moves.append(ProposedMove(
                        kind="add_qualification", instructor_id=donor.id,
                        course_id=course.id,
                        rationale=f"No one is qualified for {course.code}; cross-train {donor.name}."))
        for course in scenario.courses:
            demand = sum(scenario.enrollment_for_section(s)
                         for s in scenario.sections_of_course(course.id))
            supply = sum(next(r.capacity for r in scenario.rooms
                              if r.room_type == course.room_type
                              and r.capacity >= scenario.enrollment_for_section(s))
                         for s in scenario.sections_of_course(course.id))
            if demand > supply:
                moves.append(ProposedMove(
                    kind="add_section", course_id=course.id,
                    rationale=f"{course.code} demand {demand} exceeds offered seat supply {supply} (C5)."))
    if base.timetable is not None:
        from app.intelligence.matrices import placement_intervals
        slots: dict[str, list[set]] = {}
        for pl in base.timetable.placements:
            slots.setdefault(pl.course_id, []).append(placement_intervals(pl))
        placed = set(slots)
        shortfall = sorted((m for m in margins.cohorts if not m.ok), key=lambda m: m.margin)
        for m in shortfall:
            # open a course that is already offered AND currently placed so it
            # does not collide with any course the cohort already takes — only
            # then does it genuinely widen their non-conflicting set (C39).
            for cid in sorted(placed - set(m.pool_courses)):
                if not all(_courses_non_overlap(slots, cid, tc) for tc in m.example_track):
                    continue
                code = scenario.course(cid).code
                moves.append(ProposedMove(
                    kind="open_elective", cohort_id=m.cohort_id, course_id=cid,
                    rationale=f"{m.name} can only fit {m.margin} non-conflicting courses; "
                              f"opening {code} (already offered, placed clear of their track) "
                              f"widens their term plan toward the "
                              f"{config.MIN_COURSES_PER_COHORT}-course guarantee."))
    seen: set[tuple] = set()
    unique = []
    for mv in moves:
        key = (mv.kind, mv.instructor_id, mv.course_id, mv.cohort_id, mv.op_index)
        if key not in seen:
            seen.add(key)
            unique.append(mv)
    return TighteningPlan(
        assessment=_mock_assessment(base, margins, core),
        moves=unique[:3])


# --- orchestration ---------------------------------------------------------------

def run_tightener(scenario: Scenario, ops: Optional[list[Operation]] = None) -> TightenResponse:
    ops = list(ops or [])
    base = solve(scenario, ops)
    spectral = analyze(scenario)
    margins = compute_margins(scenario, base.timetable, config.MIN_COURSES_PER_COHORT)

    evidence: list[str] = list(spectral.deadlock_warnings)
    core: list[int] = []
    if base.status == "infeasible" and base.conflicts:
        core = base.conflicts.conflicting_operation_indices
        evidence.insert(0, f"CP-SAT conflict core: {base.conflicts.explanation}")
    shortfall = [f"{m.name}: margin {m.margin} < {margins.min_courses} required courses"
                 for m in margins.cohorts if not m.ok]
    if shortfall:
        evidence.append("Four-course guarantee shortfalls (C39): " + "; ".join(shortfall))

    if base.status == "infeasible":
        trigger = "infeasible"
    elif shortfall:
        trigger = "margin_shortfall"
    elif spectral.deadlock_warnings:
        trigger = "deadlock_warning"
    else:
        trigger = "none"

    plan: TighteningPlan | None
    mode = _mode()
    if trigger == "none":
        plan = None
        assessment = ("No tightening needed: the timetable solves and every cohort "
                      "clears the four-course guarantee.")
    else:
        plan = _muse_plan(scenario, evidence, ops, margins, base)
        if plan is not None:
            plan = _validate_plan(plan, scenario, ops, core)
            mode = "muse-spark"
        else:
            plan = _mock_plan(scenario, evidence, base, margins, ops, core)
            mode = "mock"  # Muse absent or failed/timed out -> template fallback

    moves: list[TighteningMove] = []
    best_result: SolveResult | None = None
    best_margins: MarginsReport | None = None
    if plan is not None:
        baseline = {m.cohort_id: m.margin for m in margins.cohorts}
        for pm in plan.moves:
            tm = TighteningMove(
                kind=pm.kind, instructor_id=pm.instructor_id, course_id=pm.course_id,
                cohort_id=pm.cohort_id, op_index=pm.op_index, rationale=pm.rationale)
            ok, detail, result, mg = verify_move(scenario, ops, tm, base, baseline)
            tm.verified = ok
            tm.detail = detail
            moves.append(tm)
            if ok and result is not None and best_result is None:
                best_result, best_margins = result, mg
        moves.sort(key=lambda m: not m.verified)

    if best_result is None:  # no move verified -> report the base world
        best_result = base if base.status != "infeasible" else None
        best_margins = margins if margins.cohorts else None

    assessment = plan.assessment if plan is not None else (
        "No tightening needed: the timetable solves and every cohort clears the "
        "four-course guarantee.")
    record_event("tighten",
                 f"trigger={trigger}; {sum(1 for m in moves if m.verified)}/{len(moves)} moves verified",
                 {"trigger": trigger, "moves": [m.kind for m in moves]})
    return TightenResponse(
        trigger=trigger, evidence=evidence, muse_mode=mode,  # type: ignore[arg-type]
        assessment=assessment, moves=moves,
        result=best_result, margins=best_margins)


_TIGHTENER_SYSTEM_PROMPT = """You are the tightening module of ScheduleSolve AI, a
department course-timetabling co-pilot. The CP-SAT solver has hit a deadlock
(an infeasible timetable, a spectral structural warning) or the four-course
offering guarantee failed for some cohort. You receive the evidence and
propose repairs from a CLOSED grammar of typed moves:

- raise_load_cap: one instructor's section cap +1 (needs instructor_id)
- add_section: one more section of a course (needs course_id)
- add_qualification: cross-train an instructor for a course (needs both ids)
- open_elective: registrar adds a course to a cohort's current term plan as an
  elective (needs cohort_id + course_id) — the fix for four-course shortfalls.
  The course MUST already be offered with a placed section and must NOT
  already be in that cohort's term plan or prerequisite chain, otherwise it
  is a no-op.
- drop_request: withdraw one parsed request, by its index in the conflict core

Rules: at most 3 moves, ranked most-promising first; every move will be
verified by a full CP-SAT re-solve before it is shown, so propose real,
checkable repairs — never invent ids; prefer structural fixes (offering,
capacity, qualification) over dropping a person's request; one sentence of
rationale per move plus a 2-3 sentence overall assessment."""


def _build_case_prompt(scenario: Scenario, evidence: list[str], ops: list[Operation],
                       margins: MarginsReport, base: SolveResult) -> str:
    instructors = "; ".join(
        f"{i.name} [{i.id}] cap {i.max_sections}, qualified {','.join(i.qualified_courses)}"
        for i in scenario.instructors)
    courses = "; ".join(f"{c.code} [{c.id}] {c.pattern} seats {c.seats}"
                        for c in scenario.courses)
    cohorts = "; ".join(
        f"{c.name} [{c.id}] term {c.current_term} of {c.graduation_year - c.admission_year}x2, "
        f"size {c.size}" for c in scenario.cohorts)
    ops_listing = "\n".join(f"[{i}] {op.op} — {op.explanation}" for i, op in enumerate(ops)) or "(none)"

    # C39 audit: name the exact open_elective candidate ids (offered, outside
    # each shortfall cohort's plan, non-conflicting with its current track) so
    # Muse proposes moves that will actually verify instead of no-ops.
    from app.intelligence.matrices import placement_intervals
    audit_lines: list[str] = []
    if base.timetable is not None and margins.cohorts:
        slots: dict[str, list[set]] = {}
        for pl in base.timetable.placements:
            slots.setdefault(pl.course_id, []).append(placement_intervals(pl))
        placed = set(slots)
        for m in sorted((x for x in margins.cohorts if not x.ok), key=lambda x: x.margin):
            candidates = sorted(
                c for c in placed - set(m.pool_courses)
                if all(_courses_non_overlap(slots, c, tc) for tc in m.example_track))
            audit_lines.append(
                f"- {m.name} [{m.cohort_id}]: margin {m.margin}/{margins.min_courses}; "
                f"track {m.example_track}; open_elective candidates {candidates or 'none'}")
    audit = "\n".join(audit_lines) if audit_lines else "(no four-course shortfall)"

    return f"""Evidence from the intelligence layer:
{chr(10).join('- ' + e for e in evidence)}

Requests under consideration:
{ops_listing}

Four-course audit (C39) — for open_elective moves, use only these candidate ids:
{audit}

Instructors: {instructors}
Courses: {courses}
Cohorts: {cohorts}

Propose up to 3 typed moves from the closed grammar. Valid ids are exactly the
bracketed ones above; drop_request indices must reference the listed requests."""
