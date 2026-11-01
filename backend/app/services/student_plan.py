"""Student advising: from a study record to a proven next-term plan.

Advising is individual. A cohort label only *infers* progress; the real
inputs are (all fed to us — nothing assumed about a student we were not
told):

  - the degree map (ingested): which courses are mandatory, which are
    optional/elective picks, and the term depth that orders them;
  - the student's study record to date: either provided by the student
    (pasted record / courses named as completed) or looked up from their
    cohort's progress when no record is provided;
  - the degree the student says they want (any program in the scenario);
  - the student's life constraints (work days, times they cannot attend).

Flow: parse (Muse Spark) -> progress (completed set vs the degree map:
mandatory done / ready / still locked behind unfinished earlier courses)
-> select (exact search over the placed timetable, mandatory-ready first,
then optional picks, one section per course, nothing conflicting, nothing
inside unavailable cells) -> verify (independent re-check before shown).

The model proposes constraints; it never picks classes and never invents
progress. If a must-take course is locked or unscheduled around the
student's life, the answer says exactly that.
"""

from __future__ import annotations

from app.intelligence.matrices import course_depths, placement_intervals
from app.models.results import (
    AgentStep,
    StudentConstraints,
    StudentPlanCourse,
    StudentPlanResponse,
    StudentProgress,
)
from app.models.scenario import PERIOD_COUNT, Program, Scenario
from app.parsing.student import StudentPlanParser, extract_course_ids
from app.solver.scheduling_model import solve

_MAX_NODES = 200_000


def _section_score(period: int | None, c: StudentConstraints) -> int:
    if period is None:
        return 0
    score = 0
    if c.prefer_morning:
        score += (3 - period) * 2
    if c.prefer_afternoon:
        score += period * 2
    return score


def resolve_completed(
    scenario: Scenario,
    program: Program,
    cohort,  # noqa: ANN001
    explicit_ids: list[str],
    record_text: str | None,
    parsed_completed: list[str],
) -> tuple[list[str], str]:
    """The student's completed set, from the best source we were given."""
    valid = {c.id for c in scenario.courses}
    explicit = {x for x in explicit_ids if x in valid}
    if record_text:
        explicit |= set(extract_course_ids(record_text, scenario))
    explicit |= {x for x in parsed_completed if x in valid}
    if explicit:
        return sorted(explicit), "study record you provided"
    if cohort is not None:
        done = sorted({
            r.course_id
            for term, reqs in program.roadmap.items() if int(term) < cohort.current_term
            for r in reqs if r.required
        } & valid)
        return done, f"progress lookup for {cohort.name} (record not provided)"
    return [], "no study record provided"


def suggest_student_plan(
    scenario: Scenario,
    cohort_id: str | None = None,
    message: str = "",
    parser: StudentPlanParser | None = None,
    target_override: int | None = None,
    program_id: str | None = None,
    study_record: str | None = None,
    completed_course_ids: list[str] | None = None,
) -> StudentPlanResponse:
    cohort = next((c for c in scenario.cohorts if c.id == cohort_id), None)
    if cohort_id and cohort is None:
        raise ValueError(f"Unknown cohort '{cohort_id}'.")
    program = next((p for p in scenario.programs if p.id == program_id), None) \
        if program_id else None
    if program is None and cohort is not None:
        program = next(p for p in scenario.programs if p.id == cohort.program_id)
    if program is None:
        raise ValueError("Tell us your degree (program) or cohort so we can advise.")

    parser = parser or StudentPlanParser()
    depths = course_depths(program)
    mandatory_all = {r.course_id for reqs in program.roadmap.values()
                     for r in reqs if r.required}
    optional_all = {r.course_id for reqs in program.roadmap.values()
                    for r in reqs if not r.required}
    roadmap_courses = mandatory_all | optional_all

    # Parse against everything this degree could involve (must/completed
    # validation), then narrow to what is actually left for this student.
    parse_pool = sorted(roadmap_courses | {c.id for c in scenario.courses})
    constraints = parser.parse(message, scenario, cohort, [], parse_pool)
    if target_override:
        constraints.target_courses = max(1, min(6, target_override))
    target = constraints.target_courses

    completed, source = resolve_completed(
        scenario, program, cohort, completed_course_ids or [],
        study_record, constraints.completed_course_ids)
    completed_set = set(completed)

    def eligible(cid: str) -> bool:
        """Every strictly-earlier degree-map course is on the record."""
        return all(o in completed_set for o, d in depths.items()
                   if d < depths.get(cid, 0))

    def blockers(cid: str) -> set[str]:
        return {o for o, d in depths.items()
                if d < depths.get(cid, 0)} - completed_set

    remaining_mandatory = sorted(mandatory_all - completed_set)
    ready_mandatory = [c for c in remaining_mandatory if eligible(c)]
    remaining_optional = sorted((optional_all - completed_set)
                                | ({c.id for c in scenario.courses}
                                   - roadmap_courses - completed_set))
    ready_optional = [c for c in remaining_optional if c not in depths or eligible(c)]
    ready_set = set(ready_mandatory) | set(ready_optional)
    # Co-enrollment: a course whose only unfinished earlier courses are
    # themselves takeable this term can be co-taken with its gating course.
    co_ready = [c for c in remaining_mandatory + remaining_optional
                if c not in ready_set and blockers(c) and blockers(c) <= ready_set]
    locked_mandatory = [c for c in remaining_mandatory
                        if not eligible(c) and c not in co_ready]

    progress = StudentProgress(
        source=source, program_id=program.id, program_name=program.name,
        completed_course_ids=completed,
        required_total=len(mandatory_all),
        required_completed=len(mandatory_all & completed_set),
        pct_complete=round(100 * len(mandatory_all & completed_set)
                           / max(1, len(mandatory_all))),
        mandatory_ready=[scenario.course_code(c) for c in ready_mandatory],
        mandatory_co_ready=[scenario.course_code(c) for c in co_ready
                            if c in mandatory_all],
        mandatory_locked=[scenario.course_code(c) for c in locked_mandatory],
        optional_remaining=len(remaining_optional))

    trace: list[AgentStep] = []
    actor = f"Muse Spark · {parser.model}" if parser.mode == "muse-spark" else "Deterministic mock parser"
    latency = f" in {parser.last_latency_ms} ms" if parser.last_latency_ms else ""
    trace.append(AgentStep(
        step="parse", actor=actor,
        detail=f"Parsed the student's request{latency}: must={constraints.must_course_ids or '—'}, "
               f"completed={constraints.completed_course_ids or '—'}, "
               f"unavailable days={constraints.avoid_days or '—'}, "
               f"unavailable periods={constraints.avoid_periods or '—'}, target={target} courses."))
    trace.append(AgentStep(
        step="progress", actor="Degree-map audit",
        detail=f"{source.capitalize()}: {progress.required_completed} of "
               f"{progress.required_total} mandatory courses completed "
               f"({progress.pct_complete}%). Ready now: "
               f"{', '.join(progress.mandatory_ready) or 'none'}"
               + (f". Still locked: {', '.join(progress.mandatory_locked)}." if progress.mandatory_locked else ".")))

    notes: list[str] = []
    must: list[str] = []
    for cid in constraints.must_course_ids:
        if cid in completed_set:
            notes.append(f"{scenario.course_code(cid)} is already on your record — "
                         f"no need to take it again.")
        elif cid in locked_mandatory:
            missing = [scenario.course_code(o) for o in blockers(cid)]
            notes.append(f"{scenario.course_code(cid)} is still locked: "
                         f"{', '.join(missing)} must be completed first.")
        elif cid not in ready_set and cid not in co_ready:
            notes.append(f"{scenario.course_code(cid)} is not part of the "
                         f"{program.name} degree map.")
        else:
            must.append(cid)

    result = solve(scenario)
    if result.status in ("infeasible", "unknown") or result.timetable is None:
        trace.append(AgentStep(
            step="solve", actor="CP-SAT", status="blocked",
            detail=f"No placed timetable to advise from (solve {result.status})."))
        return StudentPlanResponse(
            cohort_id=cohort.id if cohort else None,
            cohort_name=cohort.name if cohort else "",
            constraints=constraints, progress=progress, target_courses=target,
            notes=notes + ["No timetable could be built for this term, "
                           "so no personal plan can be suggested yet."],
            parser_mode=parser.mode, model=parser.model,  # type: ignore[arg-type]
            parser_latency_ms=parser.last_latency_ms, agent_trace=trace)

    by_course: dict[str, list] = {}
    for pl in result.timetable.placements:
        by_course.setdefault(pl.course_id, []).append(pl)

    forbidden = {(d, p) for d in constraints.avoid_days for p in range(PERIOD_COUNT)} | \
                {(d, p) for d in range(5) for p in constraints.avoid_periods}

    eligible_courses = ready_mandatory + ready_optional + co_ready
    candidates: dict[str, list] = {}
    for cid in eligible_courses:
        sections = [pl for pl in by_course.get(cid, [])
                    if not (placement_intervals(pl) & forbidden)]
        if sections:
            sections.sort(key=lambda pl: -_section_score(pl.period, constraints))
            candidates[cid] = sections
        elif cid in must:
            notes.append(f"{scenario.course_code(cid)} has no section outside your "
                         f"unavailable times — taking it this term would clash with "
                         f"what you told us. Talk to your coordinator about a swap.")
        elif cid in ready_mandatory and cid in by_course:
            notes.append(f"{scenario.course_code(cid)} (mandatory) only meets inside "
                         f"your unavailable times this term.")

    order = sorted(
        candidates,
        key=lambda cid: (cid not in must, cid not in ready_mandatory,
                         cid not in ready_set, depths.get(cid, 99),
                         -_section_score(candidates[cid][0].period, constraints), cid))

    # Exact branch-and-bound: maximize (must taken, mandatory taken, courses
    # up to target, preference score). One section per course, no overlaps.
    best: dict = {"key": None, "chosen": []}
    nodes = [0]

    def search(idx: int, chosen: list, used: set) -> None:
        nodes[0] += 1
        if nodes[0] > _MAX_NODES:
            return
        if idx == len(order):
            chosen_ids = {pl.course_id for pl in chosen}
            # Co-enrollment rule: a co-ready course counts only if every
            # gating course is completed or itself in this plan.
            if any(not blockers(cid) <= (completed_set | chosen_ids)
                   for cid in chosen_ids):
                return
            key = (sum(1 for pl in chosen if pl.course_id in must),
                   sum(1 for pl in chosen if pl.course_id in ready_mandatory),
                   min(len(chosen), target),
                   sum(_section_score(pl.period, constraints) for pl in chosen))
            if best["key"] is None or key > best["key"]:
                best["key"], best["chosen"] = key, list(chosen)
            return
        if best["key"] is not None:
            optimistic = (sum(1 for pl in chosen if pl.course_id in must)
                          + sum(1 for c in order[idx:] if c in must),
                          sum(1 for pl in chosen if pl.course_id in ready_mandatory)
                          + sum(1 for c in order[idx:] if c in ready_mandatory),
                          min(len(chosen) + (len(order) - idx), target),
                          10_000)
            if optimistic[:3] < best["key"][:3]:
                return
        cid = order[idx]
        for pl in candidates[cid]:
            cells = placement_intervals(pl)
            if not (cells & used):
                chosen.append(pl)
                search(idx + 1, chosen, used | cells)
                chosen.pop()
        search(idx + 1, chosen, used)  # skip this course

    search(0, [], set())
    chosen = best["chosen"]
    trace.append(AgentStep(
        step="select", actor="Exact selector (over CP-SAT timetable)",
        detail=f"Searched {nodes[0]} combinations across {len(candidates)} eligible "
               f"courses (mandatory-ready first, then optional picks); best plan takes "
               f"{sum(1 for pl in chosen if pl.course_id in ready_mandatory)} mandatory "
               f"and {sum(1 for pl in chosen if pl.course_id not in ready_mandatory)} optional."))

    # Independent verification of the finished plan — not the search's word.
    cells_seen: set = set()
    chosen_ids = {pl.course_id for pl in chosen}
    verified = True
    for pl in chosen:
        cells = placement_intervals(pl)
        if cells & cells_seen or cells & forbidden \
                or pl.course_id not in eligible_courses \
                or pl.course_id in completed_set \
                or not blockers(pl.course_id) <= (completed_set | chosen_ids):
            verified = False
        cells_seen |= cells
    trace.append(AgentStep(
        step="verify", actor="Validator",
        detail=("Re-checked the finished plan independently: no overlapping "
                "courses, nothing already on your record, nothing in your "
                "unavailable times, every course eligible in your degree map."
                if verified else "Verification failed — plan withheld."),
        status="ok" if verified else "blocked"))
    if not verified:
        chosen = []

    courses: list[StudentPlanCourse] = []
    for pl in sorted(chosen, key=lambda p: (min(p.days), p.period or 0)):
        course = scenario.course(pl.course_id)
        mandatory = pl.course_id in mandatory_all
        courses.append(StudentPlanCourse(
            course_id=pl.course_id, course_code=pl.course_code, title=course.title,
            section_id=pl.section_id, instructor_name=pl.instructor_name,
            days=pl.days, period=pl.period, start_time=pl.start_time,
            end_time=pl.end_time, room_name=pl.room_name, required=mandatory,
            reason=("Mandatory for your degree and next in sequence — skipping it "
                    "risks a delayed semester." if mandatory else
                    "Optional pick from your degree map that fits this term.")
                   + " Fits your stated availability."))

    target_met = len(courses) >= target
    if not target_met and not any("no section outside" in n for n in notes):
        notes.append(f"Only {len(courses)} non-conflicting courses fit your "
                     f"availability and progress (target {target}). Loosening a "
                     f"work block or accepting an early slot would open more of "
                     f"your degree map.")
    trace.append(AgentStep(
        step="audit", actor="Audit trail",
        detail=f"Advised {len(courses)} course(s) for {program.name}: "
               f"target {'met' if target_met else 'not met'}."))

    return StudentPlanResponse(
        cohort_id=cohort.id if cohort else None,
        cohort_name=cohort.name if cohort else "",
        constraints=constraints, progress=progress,
        courses=courses, target_courses=target, target_met=target_met, notes=notes,
        parser_mode=parser.mode, model=parser.model,  # type: ignore[arg-type]
        parser_latency_ms=parser.last_latency_ms, agent_trace=trace)
