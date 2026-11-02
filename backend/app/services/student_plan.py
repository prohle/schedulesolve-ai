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

from dataclasses import dataclass

from app.intelligence.matrices import course_depths, placement_intervals
from app.models.results import (
    AgentStep,
    StudentConstraints,
    StudentPlanConflict,
    StudentPlanCourse,
    StudentPlanResponse,
    StudentProgress,
)
from app.models.scenario import PERIOD_COUNT, Cohort, Program, Scenario, Student
from app.parsing.student import StudentPlanParser, extract_course_ids
from app.solver.scheduling_model import solve

_MAX_NODES = 200_000


@dataclass(frozen=True)
class GraduationProjection:
    """Term-level projection from the degree map, record and verified plan."""

    status: str
    projected_graduation: str
    expected_graduation: str
    note: str
    delay_terms: int
    course: str


def _term_label(cohort: Cohort | None, student: Student | None, term: int) -> str:
    """Map a 1-based term index to the calendar term the cohort entered in.

    Term 1 = Fall of the admission year; term 2 = Spring of the next year;
    term 8 = Spring four years later. Matches the seed's odd-term roadmap.
    """
    if cohort is not None:
        base_year = cohort.admission_year
    elif student is not None:
        base_year = student.entry_year
    else:
        return f"Term {term}"
    season = "Fall" if term % 2 == 1 else "Spring"
    return f"{season} {base_year + term // 2}"


def project_graduation(
    scenario: Scenario,
    cohort: Cohort | None,
    student: Student | None,
    program: Program,
    completed: set[str],
    plan_course_ids: set[str],
    target_courses: int,
) -> GraduationProjection:
    """Project the term when every mandatory course can be completed.

    Inputs: degree-map depth (the sequence), completed courses, locked
    prerequisites, the current term's verified plan, and the student's course
    load. Future terms are simulated at the student's target load, taking
    eligible mandatory courses in depth order. Optional electives are not
    counted against the mandatory chain (they are shown separately).
    """
    depths = course_depths(program)
    mandatory = {r.course_id for reqs in program.roadmap.values()
                 for r in reqs if r.required}
    remaining = set(mandatory) - set(completed)
    current = cohort.current_term if cohort is not None else 1
    expected_term = (
        max(1, (cohort.graduation_year - cohort.admission_year) * 2)
        if cohort is not None
        else max(current, max((depths.get(c, current) for c in mandatory), default=current))
    )
    expected_label = _term_label(cohort, student, expected_term)
    if not remaining:
        return GraduationProjection(
            "complete", expected_label, expected_label,
            f"All mandatory courses complete — {expected_label}", 0, "")

    # Only mandatory earlier-depth courses gate a later mandatory course.
    earlier = {
        c: {o for o, d in depths.items() if d < depths.get(c, 0) and o in mandatory}
        for c in remaining
    }
    done = set(completed)
    taken: list[str] = []
    term = current
    last_course: str | None = None
    cap = max(1, target_courses)
    for _ in range(max(expected_term, current) + 16):
        if not remaining:
            break
        if term == current:
            # The verified plan is the truth for the term being advised;
            # it may co-enroll a course ahead of its depth.
            take = sorted(
                (c for c in remaining if c in plan_course_ids),
                key=lambda c: (depths.get(c, 0), scenario.course_code(c)))
        else:
            eligible = [
                c for c in remaining
                if earlier[c] <= done and depths.get(c, 0) <= term
            ]
            eligible.sort(key=lambda c: (depths.get(c, 0), scenario.course_code(c)))
            take = eligible[:cap]
        for c in take:
            done.add(c)
            remaining.discard(c)
            taken.append(c)
            last_course = c
        if not remaining:
            break
        term += 1

    projected_term = term if not remaining else term + 1
    projected_label = _term_label(cohort, student, projected_term)
    if projected_term <= expected_term:
        # On track means graduating at the expected term; an earlier
        # simulated finish is not an early-graduation promise.
        return GraduationProjection(
            "on_track", expected_label, expected_label,
            f"On track for {expected_label}", 0, "")

    delay = projected_term - expected_term
    culprit: str | None
    if remaining:
        locked = [c for c in remaining if earlier[c] - done]
        pool = locked or list(remaining)
        culprit = max(pool, key=lambda c: (depths.get(c, 0), scenario.course_code(c)))
    elif taken:
        # The chain finished late: name the deepest course in it (the one
        # whose prerequisites forced the extra term), not an arbitrary pick.
        culprit = max(taken, key=lambda c: (depths.get(c, 0), scenario.course_code(c)))
    else:
        culprit = last_course
    code = scenario.course_code(culprit) if culprit else "A required course"
    return GraduationProjection(
        "delayed", projected_label, expected_label,
        f"{code} pushes graduation +{delay} term{'s' if delay != 1 else ''} — projected {projected_label}",
        delay, code)


def _section_score(period: int | None, c: StudentConstraints,
                   days: list[int] | None = None) -> int:
    score = 0
    if days and c.preferred_days:
        score += 2 * sum(1 for day in days if day in c.preferred_days)
    if period is None:
        return score
    if c.prefer_morning:
        score += (3 - period) * 2
    if c.prefer_afternoon:
        score += period * 2
    if c.preferred_periods and period in c.preferred_periods:
        score += 3
    return score


@dataclass(frozen=True)
class CompletedSources:
    """Both possible progress sources, kept separate so a disagreement can be
    shown to the student instead of one silently overwriting the other."""

    record: set[str]
    lookup: set[str]
    record_given: bool
    source: str


def completed_sources(
    scenario: Scenario,
    program: Program,
    cohort,  # noqa: ANN001
    explicit_ids: list[str],
    record_text: str | None,
    parsed_completed: list[str],
) -> CompletedSources:
    """The record the student supplied and the cohort lookup, side by side."""
    valid = {c.id for c in scenario.courses}
    record = {x for x in explicit_ids if x in valid}
    if record_text:
        record |= set(extract_course_ids(record_text, scenario))
    record |= {x for x in parsed_completed if x in valid}
    lookup: set[str] = set()
    if cohort is not None:
        lookup = {
            r.course_id
            for term, reqs in program.roadmap.items() if int(term) < cohort.current_term
            for r in reqs if r.required
        } & valid
    if record:
        return CompletedSources(record, lookup, True, "study record you provided")
    if cohort is not None:
        return CompletedSources(
            record, lookup, False,
            f"progress lookup for {cohort.name} (record not provided)")
    return CompletedSources(record, lookup, False, "no study record provided")


def resolve_completed(
    scenario: Scenario,
    program: Program,
    cohort,  # noqa: ANN001
    explicit_ids: list[str],
    record_text: str | None,
    parsed_completed: list[str],
) -> tuple[list[str], str]:
    """The student's completed set, from the best source we were given."""
    sources = completed_sources(
        scenario, program, cohort, explicit_ids, record_text, parsed_completed)
    if sources.record_given:
        return sorted(sources.record), sources.source
    if cohort is not None:
        return sorted(sources.lookup), sources.source
    return [], sources.source


_DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri"]


def _availability_sources(scenario: Scenario, code: str, sections: list,
                          c: StudentConstraints) -> list[str]:
    """The two sources behind a course-vs-availability clash, named."""
    blocked = []
    if c.avoid_days:
        blocked.append("days " + ", ".join(_DAY_SHORT[d] for d in sorted(c.avoid_days)))
    if c.avoid_periods:
        blocked.append("periods " + ", ".join(str(p + 1) for p in sorted(c.avoid_periods)))
    yours = ("Your availability (from your message): unavailable "
             + ("; ".join(blocked) if blocked else "at the requested times"))
    placed = "; ".join(
        f"{code} meets {', '.join(_DAY_SHORT[d] for d in pl.days)} "
        f"{pl.start_time}-{pl.end_time} with {pl.instructor_name} in {pl.room_name}"
        for pl in sections) or f"no placed section of {code}"
    return [yours, f"Published timetable (solver-placed): {placed}"]


def suggest_student_plan(
    scenario: Scenario,
    cohort_id: str | None = None,
    message: str = "",
    parser: StudentPlanParser | None = None,
    target_override: int | None = None,
    program_id: str | None = None,
    study_record: str | None = None,
    completed_course_ids: list[str] | None = None,
    student_id: str | None = None,
    target_credits: int | None = None,
    resolutions: dict[str, str] | None = None,
) -> StudentPlanResponse:
    # The student's arbitration of contradictions, keyed by conflict kind.
    # Anything not supplied keeps the documented default.
    resolutions = dict(resolutions or {})
    student = next((s for s in scenario.students if s.id == student_id), None)
    if student_id and student is None:
        raise ValueError(
            f"Missing input: unknown student '{student_id}'. Pick a valid "
            f"student or supply your cohort.")
    if student is not None:
        cohort_id = cohort_id or student.cohort_id
        program_id = program_id or student.program_id
        completed_course_ids = list(completed_course_ids or []) + list(
            student.completed_course_ids)
    cohort = next((c for c in scenario.cohorts if c.id == cohort_id), None)
    if cohort_id and cohort is None:
        raise ValueError(
            f"Missing input: unknown cohort '{cohort_id}'. Pick a cohort from "
            f"the institution or supply your degree.")
    program = next((p for p in scenario.programs if p.id == program_id), None) \
        if program_id else None
    if program is None and cohort is not None:
        program = next(p for p in scenario.programs if p.id == cohort.program_id)
    if program is None:
        raise ValueError(
            "Missing input: your degree (program_id) or cohort_id — we cannot "
            "advise without one.")

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
    if student is not None:
        # Campus days are a hard preference ("I can only come Tue/Thu");
        # preferred days/periods are soft ordering hints, never exclusions.
        if student.campus_days:
            constraints.avoid_days = sorted(
                set(constraints.avoid_days)
                | (set(range(5)) - set(student.campus_days)))
        constraints.preferred_days = sorted(
            set(constraints.preferred_days) | set(student.preferred_days))
        constraints.preferred_periods = sorted(
            set(constraints.preferred_periods) | set(student.preferred_periods))
    if target_override:
        constraints.target_courses = max(1, min(6, target_override))
    elif target_credits:
        # Convert a credit target to a course count using the smallest
        # common course credit in the catalog (never fewer than 1).
        min_credit = min((c.credits for c in scenario.courses), default=3)
        constraints.target_courses = max(
            1, min(6, int((target_credits + min_credit - 1) // min_credit)))
    target = max(constraints.target_courses,
                 scenario.policy.min_courses_full_time)

    sources = completed_sources(
        scenario, program, cohort, completed_course_ids or [],
        study_record, constraints.completed_course_ids)
    record, lookup = set(sources.record), set(sources.lookup)
    conflicts: list[StudentPlanConflict] = []
    missing_inputs: list[str] = []

    # Never silently overwrite one progress source with the other: when the
    # student's own record and the cohort lookup disagree, the response names
    # both sides and lets the student choose which wins.
    if sources.record_given and cohort is not None and record != lookup:
        only_record = sorted(record - lookup)
        only_lookup = sorted(lookup - record)
        parts = []
        if only_record:
            parts.append("your record adds "
                         + ", ".join(scenario.course_code(c) for c in only_record))
        if only_lookup:
            parts.append("the cohort lookup adds "
                         + ", ".join(scenario.course_code(c) for c in only_lookup))
        chosen = resolutions.get("record_vs_lookup", "record")
        if chosen not in ("record", "lookup"):
            chosen = "record"
        conflicts.append(StudentPlanConflict(
            kind="record_vs_lookup",
            summary="Your study record and your cohort's progress lookup disagree.",
            detail="; ".join(parts) + ". Choose which source wins.",
            options=["record", "lookup"],
            default_option="record",
            chosen_option=chosen,
            sources=[
                "Your study record (what you supplied): completed "
                + (", ".join(scenario.course_code(c) for c in sorted(record)) or "nothing"),
                f"Cohort lookup for {cohort.name} (degree-map terms before "
                f"term {cohort.current_term}): completed "
                + (", ".join(scenario.course_code(c) for c in sorted(lookup)) or "nothing"),
            ]))
        if chosen == "lookup":
            completed_set = lookup
            source = (f"progress lookup for {cohort.name} "
                      "(you chose the cohort lookup over your record)")
        else:
            completed_set = record
            source = sources.source
    elif sources.record_given:
        completed_set = record
        source = sources.source
    elif cohort is not None:
        completed_set = lookup
        source = sources.source
    else:
        completed_set = set()
        source = sources.source
    completed = sorted(completed_set)

    # "I need CS 201" when CS 201 is already on the record is a contradiction.
    # Default: keep it completed. If the student chooses "retake", pull it off
    # the record before eligibility is computed so the plan can include it.
    retake: set[str] = set()
    if resolutions.get("must_already_completed") == "retake":
        retake = {c for c in constraints.must_course_ids if c in completed_set}
        if retake:
            completed_set -= retake
            completed = sorted(completed_set)

    # Tell the student exactly what is missing rather than quietly assuming.
    if not sources.record_given:
        if cohort is not None:
            missing_inputs.append(
                "Your individual study record (completed courses) — the "
                f"projection is using {cohort.name}'s roadmap position, which "
                "may not match your transcript.")
        else:
            missing_inputs.append(
                "Your completed courses (a study record or course codes) — "
                "without them we cannot audit progress or project graduation.")
    if not program.roadmap:
        missing_inputs.append(
            f"A degree map for {program.name} — the institution has not "
            "published one yet.")

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

    projection = project_graduation(
        scenario, cohort, student, program, completed_set, set(), target)
    progress = StudentProgress(
        source=source, program_id=program.id, program_name=program.name,
        completed_course_ids=completed,
        projected_graduation=projection.projected_graduation,
        expected_graduation=projection.expected_graduation,
        projection_status=projection.status,
        projection_note=projection.note,
        graduation_delay_terms=projection.delay_terms,
        projection_course=projection.course,
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
        code = scenario.course_code(cid)
        if cid in retake:
            conflicts.append(StudentPlanConflict(
                kind="must_already_completed",
                summary=f"You asked for {code}, but it is already on your record.",
                detail="You chose to retake it this term.",
                options=["completed", "retake"],
                default_option="completed",
                chosen_option="retake",
                sources=[
                    f"Your study record: {code} is already completed.",
                    f"Your request in this message: you asked to take {code} this term.",
                ]))
            notes.append(f"You chose to retake {code}; it is treated as a "
                         f"request this term even though it is on your record.")
            if cid in ready_set or cid in co_ready:
                must.append(cid)
            else:
                missing = [scenario.course_code(o) for o in blockers(cid)]
                notes.append(f"{code} cannot be retaken this term: "
                             f"{', '.join(missing)} must be completed first.")
        elif cid in completed_set:
            conflicts.append(StudentPlanConflict(
                kind="must_already_completed",
                summary=f"You asked for {code}, but it is already on your record.",
                detail=("Keep it completed and spend the term on something else, or "
                        "retake it deliberately."),
                options=["completed", "retake"],
                default_option="completed",
                chosen_option="completed",
                sources=[
                    f"Your study record: {code} is already completed.",
                    f"Your request in this message: you asked to take {code} this term.",
                ]))
            notes.append(f"{code} is already on your record — "
                         f"no need to take it again.")
        elif cid in locked_mandatory:
            missing = [scenario.course_code(o) for o in blockers(cid)]
            notes.append(f"{code} is still locked: "
                         f"{', '.join(missing)} must be completed first.")
        elif cid not in ready_set and cid not in co_ready:
            notes.append(f"{code} is not part of the "
                         f"{program.name} degree map.")
        else:
            must.append(cid)

    result = solve(scenario)
    if result.status in ("infeasible", "unknown") or result.timetable is None:
        trace.append(AgentStep(
            step="solve", actor="CP-SAT", status="blocked",
            detail=f"No placed timetable to advise from (solve {result.status})."))
        trace.append(AgentStep(
            step="projection", actor="Degree-map projection",
            detail=projection.note))
        return StudentPlanResponse(
            cohort_id=cohort.id if cohort else None,
            cohort_name=cohort.name if cohort else "",
            constraints=constraints, progress=progress, target_courses=target,
            projected_graduation=projection.projected_graduation,
            expected_graduation=projection.expected_graduation,
            projection_status=projection.status,
            projection_note=projection.note,
            graduation_delay_terms=projection.delay_terms,
            projection_course=projection.course,
            notes=notes + ["No timetable could be built for this term, "
                           "so no personal plan can be suggested yet."],
            missing_inputs=missing_inputs, conflicts=conflicts,
            parser_mode=parser.mode, model=parser.model,  # type: ignore[arg-type]
            parser_latency_ms=parser.last_latency_ms, agent_trace=trace)

    by_course: dict[str, list] = {}
    for pl in result.timetable.placements:
        by_course.setdefault(pl.course_id, []).append(pl)

    forbidden = {(d, p) for d in constraints.avoid_days for p in range(PERIOD_COUNT)} | \
                {(d, p) for d in range(5) for p in constraints.avoid_periods}

    eligible_courses = ready_mandatory + ready_optional + co_ready
    candidates: dict[str, list] = {}
    relaxed_courses: set[str] = set()
    must_conflict_choice = resolutions.get("must_vs_availability", "availability")
    if must_conflict_choice not in ("availability", "course"):
        must_conflict_choice = "availability"
    for cid in eligible_courses:
        sections = [pl for pl in by_course.get(cid, [])
                    if not (placement_intervals(pl) & forbidden)]
        if sections:
            sections.sort(key=lambda pl: -_section_score(pl.period, constraints, pl.days))
            candidates[cid] = sections
        elif cid in must:
            code = scenario.course_code(cid)
            all_sections = sorted(
                by_course.get(cid, []),
                key=lambda pl: -_section_score(pl.period, constraints, pl.days))
            if must_conflict_choice == "course" and all_sections:
                candidates[cid] = all_sections
                relaxed_courses.add(cid)
                notes.append(
                    f"You chose {code} over your stated availability — its "
                    f"section meets in a time you marked unavailable. Expect a "
                    f"clash with work or another commitment.")
                conflicts.append(StudentPlanConflict(
                    kind="must_vs_availability",
                    summary=f"{code} only meets inside the times you marked unavailable.",
                    detail=("Keeping the course may clash with work or another "
                            "commitment; keeping your availability may delay it."),
                    options=["availability", "course"],
                    default_option="availability",
                    chosen_option="course",
                    sources=_availability_sources(scenario, code, all_sections, constraints)))
            else:
                notes.append(f"{code} has no section outside your "
                             f"unavailable times — taking it this term would clash "
                             f"with what you told us. Talk to your coordinator "
                             f"about a swap, or choose the course over your "
                             f"availability.")
                conflicts.append(StudentPlanConflict(
                    kind="must_vs_availability",
                    summary=f"{code} only meets inside the times you marked unavailable.",
                    detail=("Keeping the course may clash with work or another "
                            "commitment; keeping your availability may delay it."),
                    options=["availability", "course"],
                    default_option="availability",
                    chosen_option="availability",
                    sources=_availability_sources(scenario, code, all_sections, constraints)))
        elif cid in ready_mandatory and cid in by_course:
            notes.append(f"{scenario.course_code(cid)} (mandatory) only meets inside "
                         f"your unavailable times this term.")

    order = sorted(
        candidates,
        key=lambda cid: (cid not in must, cid not in ready_mandatory,
                         cid not in ready_set, depths.get(cid, 99),
                         -_section_score(candidates[cid][0].period, constraints, candidates[cid][0].days), cid))

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
                   sum(_section_score(pl.period, constraints, pl.days) for pl in chosen))
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
        clashes_with_life = cells & forbidden and pl.course_id not in relaxed_courses
        if cells & cells_seen or clashes_with_life \
                or pl.course_id not in eligible_courses \
                or pl.course_id in completed_set \
                or not blockers(pl.course_id) <= (completed_set | chosen_ids):
            verified = False
        cells_seen |= cells
    trace.append(AgentStep(
        step="verify", actor="Validator",
        detail=(("Re-checked the finished plan independently: no overlapping "
                 "courses, nothing already on your record, every course "
                 "eligible in your degree map.")
                + ("" if not relaxed_courses else
                   " You explicitly chose the course over your unavailable "
                   "times for: " + ", ".join(
                       scenario.course_code(c) for c in sorted(relaxed_courses)) + ".")
                if verified else "Verification failed — plan withheld."),
        status="ok" if verified else "blocked"))
    if not verified:
        chosen = []

    projection = project_graduation(
        scenario, cohort, student, program, completed_set,
        {pl.course_id for pl in chosen}, target)
    progress.projected_graduation = projection.projected_graduation
    progress.expected_graduation = projection.expected_graduation
    progress.projection_status = projection.status  # type: ignore[assignment]
    progress.projection_note = projection.note
    progress.graduation_delay_terms = projection.delay_terms
    progress.projection_course = projection.course
    trace.append(AgentStep(
        step="projection", actor="Degree-map projection",
        detail=projection.note))

    courses: list[StudentPlanCourse] = []
    for pl in sorted(chosen, key=lambda p: (min(p.days), p.period or 0)):
        course = scenario.course(pl.course_id)
        mandatory = pl.course_id in mandatory_all
        courses.append(StudentPlanCourse(
            course_id=pl.course_id, course_code=pl.course_code, title=course.title,
            section_id=pl.section_id, instructor_name=pl.instructor_name,
            days=pl.days, period=pl.period, start_time=pl.start_time,
            end_time=pl.end_time, room_name=pl.room_name, required=mandatory,
            credits=course.credits,
            reason=("Mandatory for your degree and next in sequence — skipping it "
                    "risks a delayed semester." if mandatory else
                    "Optional pick from your degree map that fits this term.")
                   + " Fits your stated availability."))

    credits_selected = sum(scenario.course(pl.course_id).credits for pl in chosen)
    full_time = scenario.policy.is_full_time(len(courses), credits_selected)
    target_met = len(courses) >= target and (
        not target_credits or credits_selected >= target_credits)
    if not target_met and not any("no section outside" in n for n in notes):
        notes.append(f"Only {len(courses)} non-conflicting courses "
                     f"({credits_selected} credits) fit your availability and "
                     f"progress (target {target} courses / "
                     f"{scenario.policy.min_credits_full_time} credits for "
                     f"full-time). Loosening a work block or accepting an early "
                     f"slot would open more of your degree map.")
    if not full_time:
        notes.append(
            f"Below the coordinator's full-time threshold "
            f"({scenario.policy.min_courses_full_time} courses or "
            f"{scenario.policy.min_credits_full_time} credits).")
    trace.append(AgentStep(
        step="audit", actor="Audit trail",
        detail=f"Advised {len(courses)} course(s) for {program.name}: "
               f"target {'met' if target_met else 'not met'}."))

    return StudentPlanResponse(
        cohort_id=cohort.id if cohort else None,
        cohort_name=cohort.name if cohort else "",
        constraints=constraints, progress=progress,
        courses=courses, target_courses=target, target_met=target_met,
        credits_selected=credits_selected, full_time=full_time,
        projected_graduation=projection.projected_graduation,
        expected_graduation=projection.expected_graduation,
        projection_status=projection.status,  # type: ignore[arg-type]
        projection_note=projection.note,
        graduation_delay_terms=projection.delay_terms,
        projection_course=projection.course,
        notes=notes,
        missing_inputs=missing_inputs, conflicts=conflicts,
        parser_mode=parser.mode, model=parser.model,  # type: ignore[arg-type]
        parser_latency_ms=parser.last_latency_ms, agent_trace=trace)
