"""CP-SAT academic course timetabling model.

Decisions: for each section -> (instructor, timeslot, room), honoring:

- C13 qualification, C14 hard unavailability (pre-filtered at build time)
- C15 load caps, C16 prep caps
- C17 instructor no-overlap, C23 room no-double-booking
- C24 capacity, C25 room-type match, C26 room blackouts (pre-filtered)
- C29 fixed meeting patterns (MWF / TTh / weekly lab block)
- C7  same-cohort sections never overlap
- C8  cohort daily load cap
- C32 campus geography: back-to-back classes must be walkable
- C19/C20 instructor soft preferences as objective penalties

Every constraint coming from the current request is guarded by a CP-SAT
assumption literal, so `SufficientAssumptionsForInfeasibility()` returns the
minimal conflicting subset of the request — the solver, not the LLM,
explains conflicts.

`propose_candidates` answers "who could potentially be available": for each
instructor qualified for an affected section, it probes a CP-SAT solve with
everything else frozen, returning verified feasibility + preference delta.
"""

from __future__ import annotations

import time
from typing import Optional

from ortools.sat.python import cp_model

from app import config
from app.models.results import (
    CandidateProposal,
    ConflictReport,
    Placement,
    SolveResult,
    Timetable,
    operation_source,
)
from app.models.scenario import (
    BLOCK_DAYS,
    BLOCK_PERIODS,
    DAY_NAMES,
    InstructorPreference,
    Operation,
    PATTERN_DAYS,
    PERIOD_COUNT,
    PERIOD_NAMES,
    Scenario,
    Section,
    period_end_time,
    period_start_time,
)

VAR_KEY = tuple  # (section_id, instructor_id, slot_key, room_id)


def _default_spectral_hints(sc: Scenario) -> dict[str, int]:
    """Spectral warm-start hints, computed lazily inside solve().

    Imported at call time (not module load) so the solver never triggers an
    import cycle with the intelligence package; any spectral failure degrades
    to "no hints" rather than a broken solve — the radar is advisory, CP-SAT
    still proves optimality either way.
    """
    try:
        from app.intelligence.spectral import analyze
        return analyze(sc).slot_hints
    except Exception:
        return {}


def _pattern_of(sc: Scenario, section_id: str) -> str:
    return sc.course(sc.section_by_id(section_id).course_id).pattern


def _slot_blackout(sc: Scenario, room_id: str, day: int, period: int) -> bool:
    return any(
        b.room_id == room_id and b.day == day and (b.period is None or b.period == period)
        for b in sc.room_blackouts
    )


def _hard_blocked(instructor, day: int, period: int) -> bool:
    return any(s.day == day and s.period == period for s in instructor.hard_unavailable)


def _term_closed(sc: Scenario, day: int, period: int) -> bool:
    """Holidays / campus closures: closed all day, or just that period."""
    return any(c.day == day and (c.period is None or c.period == period)
               for c in sc.closures)


def _options(sc: Scenario, section: Section) -> list[tuple[str, str, int, str]]:
    """Eligible (instructor_id, slot_key, room_id) options; slot_key is the
    period (0-3) for MWF/TTh or the day (BLOCK_DAYS) for weekly blocks."""
    course = sc.course(section.course_id)
    rooms = [r for r in sc.rooms
             if r.room_type == course.room_type
             and r.capacity >= sc.enrollment_for_section(section)
             and set(course.equipment) <= set(r.equipment)]  # C34
    insts = [i for i in sc.instructors if section.course_id in i.qualified_courses]
    opts: list[tuple[str, str, int, str]] = []
    if course.pattern in ("MWF", "TTh"):
        days = PATTERN_DAYS[course.pattern]
        for i in insts:
            for p in range(PERIOD_COUNT):
                if any(_hard_blocked(i, d, p) for d in days):
                    continue
                if any(_term_closed(sc, d, p) for d in days):
                    continue
                for r in rooms:
                    if any(_slot_blackout(sc, r.id, d, p) for d in days):
                        continue
                    opts.append((i.id, p, r.id))
    else:  # weekly block
        for i in insts:
            for d in BLOCK_DAYS:
                if any(_hard_blocked(i, d, p) for p in BLOCK_PERIODS):
                    continue
                if any(_term_closed(sc, d, p) for p in BLOCK_PERIODS):
                    continue
                for r in rooms:
                    if any(_slot_blackout(sc, r.id, d, p) for p in BLOCK_PERIODS):
                        continue
                    opts.append((i.id, d, r.id))
    return opts


def _covers(sc: Scenario, section_id: str, slot_key: int, day: Optional[int], period: Optional[int]) -> bool:
    """Does an assignment (section at slot_key) occupy (day, period)? None = wildcard."""
    pattern = _pattern_of(sc, section_id)
    if pattern in ("MWF", "TTh"):
        if day is not None and day not in PATTERN_DAYS[pattern]:
            return False
        return period is None or slot_key == period
    # block
    if day is not None and slot_key != day:
        return False
    return period is None or period in BLOCK_PERIODS


def solve(
    sc: Scenario,
    request_ops: Optional[list[Operation]] = None,
    pins_exact: Optional[dict[str, tuple[str, int, str]]] = None,
    instructor_pins: Optional[dict[str, str]] = None,
    slot_hints: Optional[dict[str, int]] = None,
    objective: str = "preference",
    engine: str = "cpsat",
) -> SolveResult:
    if engine != "cpsat":
        # Plug-and-play dispatch (app.solver.engine registry): "ours",
        # "greedy", and any future engine behind the same SolveResult
        # contract. Imported lazily — home_solver reuses this module's
        # option generator.
        from app.solver.engine import solve_with
        return solve_with(engine, sc, request_ops, pins_exact=pins_exact,
                          instructor_pins=instructor_pins, slot_hints=slot_hints,
                          objective=objective)
    t0 = time.perf_counter()
    request_ops = list(request_ops or [])
    m = cp_model.CpModel()

    opts: dict[str, list[tuple[str, int, str, str]]] = {
        s.id: _options(sc, s) for s in sc.sections
    }
    empty = sorted(s.id for s in sc.sections if not opts[s.id])
    if empty:
        # No legal (instructor, slot, room) for a section. Report a proven
        # infeasibility instead of letting a later constraint index an empty
        # variable set.
        return SolveResult(
            status="infeasible",
            conflicts=ConflictReport(
                conflicting_operation_indices=[],
                explanation=(f"{len(empty)} section(s) have no legal placement "
                             f"under the current rules (e.g. {', '.join(empty[:3])})."),
                suggestion="Relax room/blackout/qualification constraints.",
                sources=["Institution model (base scenario): these sections have "
                         "no qualified instructor, fitting room, and open slot "
                         "under the current hard rules."]),
            solve_time_ms=int((time.perf_counter() - t0) * 1000))

    if slot_hints is None:
        slot_hints = _default_spectral_hints(sc)

    a: dict[VAR_KEY, cp_model.BoolVar] = {}
    for s in sc.sections:
        for (iid, key, rid) in opts[s.id]:
            a[(s.id, iid, key, rid)] = m.NewBoolVar(f"a_{s.id}_{iid}_{key}_{rid}")
        m.Add(cp_model.LinearExpr.Sum(
            [a[(s.id, *o)] for o in opts[s.id]]
        ) == 1)

    # Index the assignment vars once. At full-university scale the model
    # carries tens of thousands of vars, and rescanning all of them per
    # constraint family (with linear section/room lookups inside) made
    # model construction, not solving, the bottleneck.
    sec_course = {s.id: s.course_id for s in sc.sections}
    sec_pattern = {s.id: sc.course(sec_course[s.id]).pattern for s in sc.sections}
    room_building = {r.id: r.building_id for r in sc.rooms}
    room_capacity = {r.id: r.capacity for r in sc.rooms}
    vars_by_section: dict[str, list] = {}
    vars_by_instructor: dict[str, list] = {}
    vars_by_room: dict[str, list] = {}
    inst_cell: dict[tuple[str, int, int], list] = {}
    room_cell: dict[tuple[str, int, int], list] = {}
    for k, v in a.items():
        vars_by_section.setdefault(k[0], []).append((k, v))
        vars_by_instructor.setdefault(k[1], []).append((k, v))
        vars_by_room.setdefault(k[3], []).append((k, v))
        pat = sec_pattern[k[0]]
        cells = [(d, k[2]) for d in PATTERN_DAYS[pat]] if pat in ("MWF", "TTh") \
            else [(k[2], p) for p in BLOCK_PERIODS]
        for cell in cells:
            inst_cell.setdefault((k[1], *cell), []).append(v)
            room_cell.setdefault((k[3], *cell), []).append(v)

    def vars_of(section_id: str):
        return vars_by_section.get(section_id, [])

    # C15 instructor load: section cap (contract) + student-credit load cap.
    # Load is linear in the assignment vars because enrollment and credits are
    # constants per section; the sub-linear student curve is baked into the
    # weight, not into the constraint.
    section_weight = {s.id: sc.section_load_units(s) for s in sc.sections}
    for i in sc.instructors:
        covering = [v for _, v in vars_by_instructor.get(i.id, [])]
        if covering:
            m.Add(cp_model.LinearExpr.Sum(covering) <= i.max_sections)
        load_cap = sc.instructor_load_cap(i)
        if covering and load_cap > 0:
            weighted = [
                int(round(section_weight[k[0]] * 1000)) * v
                for k, v in vars_by_instructor.get(i.id, [])
            ]
            m.Add(cp_model.LinearExpr.Sum(weighted)
                  <= int(round(load_cap * 1000)))

    # C16 prep caps
    t: dict[tuple[str, str], cp_model.BoolVar] = {}
    for i in sc.instructors:
        by_course: dict[str, list] = {}
        for k, v in vars_by_instructor.get(i.id, []):
            by_course.setdefault(sec_course[k[0]], []).append(v)
        for cid in sorted(by_course):  # sorted: deterministic constraint order
            tv = m.NewBoolVar(f"t_{i.id}_{cid}")
            t[(i.id, cid)] = tv
            for v in by_course[cid]:
                m.Add(tv >= v)
        if by_course:
            m.Add(cp_model.LinearExpr.Sum([t[(i.id, c)] for c in sorted(by_course)]) <= i.max_preps)

    # C17 instructor busy: one thing at a time per (day, period)
    for i in sc.instructors:
        for d in range(5):
            for p in range(PERIOD_COUNT):
                covering = inst_cell.get((i.id, d, p), [])
                if len(covering) > 1:
                    m.Add(cp_model.LinearExpr.Sum(covering) <= 1)

    # C23 room busy: one section per room per (day, period)
    for r in sc.rooms:
        for d in range(5):
            for p in range(PERIOD_COUNT):
                covering = room_cell.get((r.id, d, p), [])
                if len(covering) > 1:
                    m.Add(cp_model.LinearExpr.Sum(covering) <= 1)

    # C7 same-cohort sections never overlap
    for (sa, sb) in sc.demanded_section_pairs():
        pa, pb = sec_pattern[sa.id], sec_pattern[sb.id]
        if pa == "block" and pb in ("MWF", "TTh"):  # normalize: one-period first
            sa, sb, pa, pb = sb, sa, pb, pa
        if pa in ("MWF", "TTh") and pb in ("MWF", "TTh"):
            if set(PATTERN_DAYS[pa]) & set(PATTERN_DAYS[pb]):
                for p in range(PERIOD_COUNT):
                    qa = [v for k, v in vars_by_section[sa.id] if k[2] == p]
                    qb = [v for k, v in vars_by_section[sb.id] if k[2] == p]
                    if qa and qb:
                        m.Add(cp_model.LinearExpr.Sum(qa + qb) <= 1)
        elif pa in ("MWF", "TTh") and pb == "block":
            for d in sorted(set(PATTERN_DAYS[pa]) & set(BLOCK_DAYS)):
                for p in BLOCK_PERIODS:
                    qa = [v for k, v in vars_by_section[sa.id] if k[2] == p]
                    qbd = [v for k, v in vars_by_section[sb.id] if k[2] == d]
                    if qa and qbd:
                        m.Add(cp_model.LinearExpr.Sum(qa + qbd) <= 1)
        elif pa == "block" and pb == "block":
            for d in BLOCK_DAYS:
                qda = [v for k, v in vars_by_section[sa.id] if k[2] == d]
                qdb = [v for k, v in vars_by_section[sb.id] if k[2] == d]
                if qda and qdb:
                    m.Add(cp_model.LinearExpr.Sum(qda + qdb) <= 1)

    # C8 cohort daily load cap (<= 2 meetings/day)
    for c in sc.cohorts:
        sids = {s.id for cid in sc.cohort_term_courses(c) for s in sc.sections_of_course(cid)}
        for d in range(5):
            covering = []
            for sid in sorted(sids):  # sorted: deterministic constraint order
                pattern = sec_pattern[sid]
                if pattern in ("MWF", "TTh"):
                    if d in PATTERN_DAYS[pattern]:
                        covering += [v for _, v in vars_by_section[sid]]
                else:
                    covering += [v for k, v in vars_by_section[sid] if k[2] == d]
            if len(covering) > 2:
                m.Add(cp_model.LinearExpr.Sum(covering) <= 2)

    # C32 campus geography: back-to-back cohort classes must be walkable
    bl: dict[tuple[str, str], cp_model.BoolVar] = {}
    for s in sc.sections:
        for b in sc.buildings:
            terms = [v for k, v in vars_by_section[s.id] if room_building[k[3]] == b.id]
            bv = m.NewBoolVar(f"bl_{s.id}_{b.id}")
            bl[(s.id, b.id)] = bv
            if terms:
                m.Add(cp_model.LinearExpr.Sum(terms) == bv)
            else:
                m.Add(bv == 0)
    for (sa, sb) in sc.demanded_section_pairs():
        pa, pb = sec_pattern[sa.id], sec_pattern[sb.id]
        if pa == pb and pa in ("MWF", "TTh"):
            for p in range(3):
                for b1 in sc.buildings:
                    for b2 in sc.buildings:
                        if sc.distances[b1.id][b2.id] > sc.walk_limit_min:
                            qa = [v for k, v in vars_by_section[sa.id] if k[2] == p]
                            qb = [v for k, v in vars_by_section[sb.id] if k[2] == p + 1]
                            if qa and qb:
                                m.Add(cp_model.LinearExpr.Sum(qa) + bl[(sa.id, b1.id)] + bl[(sb.id, b2.id)] <= 2)
                                m.Add(cp_model.LinearExpr.Sum(qb) + bl[(sb.id, b1.id)] + bl[(sa.id, b2.id)] <= 2)

    # exact pins (probes: freeze every other section to a known schedule)
    for sid, (iid, key, rid) in (pins_exact or {}).items():
        m.Add(a[(sid, iid, key, rid)] == 1)

    # durable world-state pins: decisions the coordinator already accepted.
    # Request ops override them, and probe pins freeze everything else.
    op_instructor_sections = {op.section_id for op in request_ops
                              if op.op == "set_section_instructor"}
    op_room_sections = {op.section_id for op in request_ops
                        if op.op == "set_section_room"}
    exact_sections = set((pins_exact or {}).keys())

    merged_instructor_pins = {**sc.instructor_pins, **(instructor_pins or {})}
    for sid, iid in merged_instructor_pins.items():
        if sid in exact_sections or sid in op_instructor_sections:
            continue
        terms = [v for k, v in vars_by_section.get(sid, []) if k[1] == iid]
        if terms:
            m.Add(cp_model.LinearExpr.Sum(terms) == 1)

    for sid, rid in sc.room_pins.items():
        if sid in exact_sections or sid in op_room_sections:
            continue
        for k, v in vars_by_section.get(sid, []):
            if k[3] != rid:
                m.Add(v == 0)

    # spectral warm start (intelligence layer): color-derived period hints on
    # cohort-conflicting sections. Hints only guide the search — they can
    # never make a feasible model infeasible.
    for sid, key in (slot_hints or {}).items():
        for k, v in vars_by_section.get(sid, []):
            m.AddHint(v, 1 if k[2] == key else 0)

    # ---- request operations behind assumption literals ----------------------
    lit_to_op: dict[int, int] = {}
    for idx, op in enumerate(request_ops):
        lit = m.NewBoolVar(f"op_{idx}")
        m.AddAssumption(lit)
        lit_to_op[lit.Index()] = idx
        if op.op == "add_instructor_unavailability":
            for k, v in vars_by_instructor.get(op.instructor_id or "", []):
                if _covers(sc, k[0], k[2], op.day, op.period):
                    m.Add(v == 0).OnlyEnforceIf(lit)
        elif op.op == "add_room_unavailability":
            for k, v in vars_by_room.get(op.room_id or "", []):
                if _covers(sc, k[0], k[2], op.day, op.period):
                    m.Add(v == 0).OnlyEnforceIf(lit)
        elif op.op == "add_term_closure":
            # Holiday / campus closure: nobody teaches into a closed slot.
            for k, v in a.items():
                if _covers(sc, k[0], k[2], op.day, op.period):
                    m.Add(v == 0).OnlyEnforceIf(lit)
        elif op.op == "set_section_instructor":
            terms = [v for k, v in vars_by_section.get(op.section_id or "", []) if k[1] == op.instructor_id]
            if terms:
                m.Add(cp_model.LinearExpr.Sum(terms) == 1).OnlyEnforceIf(lit)
            else:
                m.Add(lit == 0)  # impossible ask -> surfaces as conflict on this op
        elif op.op == "set_section_room" and op.section_id and op.room_id:
            terms = [v for k, v in vars_by_section.get(op.section_id or "", []) if k[3] == op.room_id]
            if terms:
                m.Add(cp_model.LinearExpr.Sum(terms) == 1).OnlyEnforceIf(lit)
            else:
                m.Add(lit == 0)
        elif op.op == "remove_instructor" and op.instructor_id:
            # An instructor out for the term cannot hold any section. The
            # solver either re-homes every section or proves the request
            # infeasible and returns this op in the conflict core.
            for k, v in vars_by_instructor.get(op.instructor_id, []):
                m.Add(v == 0).OnlyEnforceIf(lit)
        elif op.op == "set_load_cap" and op.instructor_id and op.value is not None:
            covering = [v for _, v in vars_by_instructor.get(op.instructor_id, [])]
            if covering:
                m.Add(cp_model.LinearExpr.Sum(covering) <= op.value).OnlyEnforceIf(lit)
        elif op.op == "set_prep_cap" and op.instructor_id and op.value is not None:
            terms = [t[(op.instructor_id, c)] for c in sorted(
                {sec_course[k[0]] for k, _ in vars_by_instructor.get(op.instructor_id, [])})
                if (op.instructor_id, c) in t]
            if terms:
                m.Add(cp_model.LinearExpr.Sum(terms) <= op.value).OnlyEnforceIf(lit)
        elif op.op == "update_enrollment" and op.section_id and op.value:
            # C37: active enrollment re-triggers the capacity check (C24):
            # every too-small room for this section is blocked while the op holds.
            for k, v in vars_by_section.get(op.section_id, []):
                if room_capacity[k[3]] < (op.value or 0):
                    m.Add(v == 0).OnlyEnforceIf(lit)

    # ---- objective (selectable: a few schedule options for the reviewer) -------
    obj_terms: list = []
    if objective == "balanced_load":
        # minimize the heaviest instructor load -> even spread across faculty
        max_load = m.NewIntVar(0, sum(i.max_sections for i in sc.instructors), "max_load")
        for i in sc.instructors:
            covering = [v for _, v in vars_by_instructor.get(i.id, [])]
            if covering:
                m.Add(max_load >= cp_model.LinearExpr.Sum(covering))
        m.Minimize(max_load)
    elif objective == "room_fit":
        # prefer the tightest room that fits each section (least wasted space)
        enroll_by_section = {s.id: sc.enrollment_for_section(s) for s in sc.sections}
        terms = []
        for (sid, _iid, _key, rid), v in a.items():
            terms.append((room_capacity[rid] - enroll_by_section[sid]) * v)
        m.Minimize(cp_model.LinearExpr.Sum(terms))
    elif objective == "building_balance":
        # Building utilization is a first-class term objective: minimize the
        # busiest *simultaneous* building occupancy (day + period) relative to
        # the building's seat capacity. This spreads sections across campus
        # instead of concentrating a time slot in one hall.
        enroll_by_section = {s.id: sc.enrollment_for_section(s) for s in sc.sections}
        building_capacity: dict[str, int] = {}
        for building in sc.buildings:
            building_capacity[building.id] = sum(
                room.capacity for room in sc.rooms if room.building_id == building.id
            )
        building_cell: dict[tuple[str, int, int], list] = {}
        for (sid, _iid, key, rid), v in a.items():
            pattern = sec_pattern[sid]
            cells = (
                [(day, key) for day in PATTERN_DAYS[pattern]]
                if pattern in ("MWF", "TTh")
                else [(key, period) for period in BLOCK_PERIODS]
            )
            for cell in cells:
                building_cell.setdefault((room_building[rid], *cell), []).append(
                    enroll_by_section[sid] * v
                )
        total_enrollment = sum(enroll_by_section.values())
        capacities = [value for value in building_capacity.values() if value > 0]
        upper = max(
            1000,
            (1000 * total_enrollment) // max(1, min(capacities, default=1)) + 1000,
        )
        max_building_util = m.NewIntVar(0, upper, "max_building_util")
        for (building_id, _day, _period), terms in building_cell.items():
            capacity = building_capacity.get(building_id, 0)
            if capacity <= 0:
                continue
            # util >= 1000 * seats_in_use / capacity  (integer, linear)
            m.Add(max_building_util * capacity >= 1000 * cp_model.LinearExpr.Sum(terms))
        m.Minimize(max_building_util)
    else:  # "preference" (default)
        prefs: list[tuple[str, InstructorPreference]] = []
        for i in sc.instructors:
            for p in i.preferences:
                prefs.append((i.id, p))
        for op in request_ops:
            if op.op == "add_instructor_preference" and op.instructor_id:
                prefs.append((op.instructor_id, InstructorPreference(
                    kind=op.kind or "avoid", day=op.day, period=op.period,
                    course_id=op.course_id, weight=op.weight or 10)))

        for iid, p in prefs:
            inst_vars = vars_by_instructor.get(iid, [])
            if p.period is not None:
                covering = [v for k, v in inst_vars if _covers(sc, k[0], k[2], None, p.period)]
                if covering:
                    iv = m.NewIntVar(0, 4, f"ip_{iid}_{p.period}")
                    m.Add(cp_model.LinearExpr.Sum(covering) == iv)
                    obj_terms.append(p.weight * iv if p.kind == "avoid" else -p.weight * iv)
            elif p.day is not None:
                covering = [v for k, v in inst_vars if _covers(sc, k[0], k[2], p.day, None)]
                if covering:
                    dv = m.NewIntVar(0, 5, f"id_{iid}_{p.day}")
                    m.Add(cp_model.LinearExpr.Sum(covering) == dv)
                    obj_terms.append(p.weight * dv if p.kind == "avoid" else -p.weight * dv)
            if p.course_id is not None:
                covering = [v for k, v in inst_vars
                            if sec_course[k[0]] == p.course_id]
                if covering:
                    cv = m.NewIntVar(0, len(covering), f"ic_{iid}_{p.course_id}")
                    m.Add(cp_model.LinearExpr.Sum(covering) == cv)
                    obj_terms.append(p.weight * cv if p.kind == "avoid" else -p.weight * cv)
        if obj_terms:
            m.Minimize(cp_model.LinearExpr.Sum(obj_terms))

    solver = cp_model.CpSolver()
    if config.SOLVER_TIME_LIMIT_S > 0:
        solver.parameters.max_time_in_seconds = config.SOLVER_TIME_LIMIT_S
    # Deterministic by default (stable demo output; ties broken the same way
    # every run). Benchmarks can raise SOLVER_WORKERS to distinguish a genuine
    # infeasibility from a single-worker timeout.
    solver.parameters.num_search_workers = config.SOLVER_WORKERS
    status = solver.Solve(m)
    elapsed_ms = int((time.perf_counter() - t0) * 1000)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE, cp_model.INFEASIBLE):
        # UNKNOWN / MODEL_INVALID: the budget expired without an
        # incumbent and without a proof. That is "unknown", never
        # "infeasible": reporting a timeout as a proven impossibility
        # would fabricate a conflict core.
        return SolveResult(status="unknown", solve_time_ms=elapsed_ms)

    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        placements = []
        counts: dict[str, int] = {}
        for s in sc.sections:
            (sid, iid, key, rid) = next(k for k, v in vars_by_section[s.id]
                                         if solver.Value(v))
            course = sc.course(sec_course[sid])
            inst = sc.instructor(iid)
            room = sc.room(rid)
            if course.pattern in ("MWF", "TTh"):
                days, period, periods = PATTERN_DAYS[course.pattern], key, [key]
            else:
                days, period, periods = [key], None, list(BLOCK_PERIODS)
            start_period = period if period is not None else periods[0]
            placements.append(Placement(
                section_id=sid, course_id=course.id, course_code=course.code,
                instructor_id=iid, instructor_name=inst.name,
                days=days, period=period, periods=periods,
                duration=course.duration_hours(),
                enrollment=sc.enrollment_for_section(sc.section_by_id(sid)),
                start_time=period_start_time(start_period),
                end_time=period_end_time(start_period, course.duration_hours()),
                room_id=room.id, room_name=room.name, building_id=room.building_id))
            counts[iid] = counts.get(iid, 0) + 1
        for i in sc.instructors:
            counts.setdefault(i.id, 0)
        return SolveResult(
            status="optimal" if status == cp_model.OPTIMAL else "feasible",
            timetable=Timetable(placements=placements, sections_per_instructor=counts),
            objective=int(solver.ObjectiveValue()),
            objective_name=objective,
            solve_time_ms=elapsed_ms,
        )

    core = solver.SufficientAssumptionsForInfeasibility()
    op_indices = sorted({lit_to_op[idx] for idx in core if idx in lit_to_op})
    if op_indices:
        named = " / ".join(f"'{request_ops[i].explanation}'" for i in op_indices)
        conflict = ConflictReport(
            conflicting_operation_indices=op_indices,
            explanation=f"These requests cannot hold together (with the base rules): {named}.",
            suggestion="Drop or relax one of the conflicting requests and re-solve.",
            sources=[operation_source(request_ops[i]) for i in op_indices],
        )
    else:
        conflict = ConflictReport(
            conflicting_operation_indices=[],
            explanation="Infeasible against the base scenario (no request could fix this).",
            suggestion="Relax room inventory, loads, or hard unavailability.",
            sources=["Institution model (base scenario): the conflict is in "
                     "the standing rules, not in any submitted request."],
        )
    return SolveResult(status="infeasible", conflicts=conflict, solve_time_ms=elapsed_ms)


def propose_candidates(sc: Scenario, base: SolveResult, removed_instructor_id: str) -> list[CandidateProposal]:
    """"Who could potentially be available?" — CP-SAT-verified coverage proposals."""
    if base.timetable is None:
        return []
    placements = {p.section_id: p for p in base.timetable.placements}
    affected = [p for p in base.timetable.placements if p.instructor_id == removed_instructor_id]
    if not affected:
        return []

    proposals: list[CandidateProposal] = []
    for lost in affected:
        pins = {
            sid: (p.instructor_id, p.period if p.period is not None else p.days[0], p.room_id)
            for sid, p in placements.items() if sid != lost.section_id
        }
        for cand in sc.instructors:
            if cand.id == removed_instructor_id or lost.course_id not in cand.qualified_courses:
                continue
            current = base.timetable.sections_per_instructor.get(cand.id, 0)
            if current + 1 > cand.max_sections:
                continue
            probe = solve(
                sc,
                request_ops=[Operation(
                    op="set_section_instructor",
                    section_id=lost.section_id,
                    instructor_id=cand.id,
                    explanation=f"probe {cand.id}",
                )],
                pins_exact=pins,
            )
            feasible = probe.status in ("optimal", "feasible")
            delta = None
            if feasible and probe.objective is not None and base.objective is not None:
                delta = probe.objective - base.objective
            reason = (f"qualified for {lost.course_code}; load {current + 1}/{cand.max_sections}"
                      + (f"; preference delta {delta}" if delta not in (None, 0) else "")
                      + ("; zero-ripple swap verified by CP-SAT" if feasible else "; would break the timetable"))
            proposals.append(CandidateProposal(
                section_id=lost.section_id, course_code=lost.course_code,
                instructor_id=cand.id, instructor_name=cand.name,
                feasible=feasible, objective_delta=delta,
                load_after=current + 1, reason=reason,
                source=(f"Faculty roster (institution model): {cand.name} is "
                        f"qualified for {lost.course_code}; published timetable "
                        f"load {current}/{cand.max_sections} sections."),
            ))
    proposals.sort(key=lambda p: (not p.feasible, p.objective_delta if p.objective_delta is not None else 9999))
    return proposals
