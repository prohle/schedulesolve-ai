"""ScheduleSolve's own solver — a from-scratch competitor to CP-SAT.

No OR-Tools. Pure Python constraint search built for exactly this problem:

- **Model**: identical domains to the CP-SAT model (same `_options`
  generator — qualification, room type/capacity/equipment, hard blackouts
  pre-filtered), identical request-op semantics, pins, and objective.
- **Search**: depth-first branch-and-bound with
  - MRV (minimum-remaining-values) variable ordering over live domains,
  - forward checking (every unassigned section must keep a viable option),
  - least-penalty value ordering (spectral slot hints break ties),
  - an admissible lower bound (sum of per-section minimum penalties) that
    proves optimality the moment an incumbent reaches it.
- **Infeasibility**: exhaustive search proves it; the minimal conflict core
  is then computed by deletion minimization, using this solver as its own
  oracle — the same contract CP-SAT's assumption literals provide.

It returns the exact same `SolveResult` shape, so the UI, the term-change flow
probes, and the comparison view can swap engines without knowing which ran.
Deterministic: sorted domains, single thread, no randomness.
"""

from __future__ import annotations

import time
from typing import Optional

from app import config
from app.models.results import ConflictReport, Placement, SolveResult, Timetable
from app.models.scenario import (
    BLOCK_PERIODS,
    InstructorPreference,
    Operation,
    PATTERN_DAYS,
    Scenario,
    period_end_time,
    period_start_time,
)
from app.solver.scheduling_model import _covers, _options

# Wall-clock budget for one home-solver run.
HOME_TIME_LIMIT_S = config.HOME_SOLVER_TIME_LIMIT_S


def _slots_of(sc: Scenario, section_id: str, key: int) -> set[tuple[int, int]]:
    pattern = sc.course(sc.section_by_id(section_id).course_id).pattern
    if pattern in ("MWF", "TTh"):
        return {(d, key) for d in PATTERN_DAYS[pattern]}
    return {(key, p) for p in BLOCK_PERIODS}


def _prepare(sc: Scenario, request_ops: list[Operation],
             pins_exact, instructor_pins, objective: str):
    """Domains after ops/pins filtering, caps, penalties, and lookup tables."""
    ops = request_ops
    op_inst_sections = {o.section_id for o in ops if o.op == "set_section_instructor"}
    op_room_sections = {o.section_id for o in ops if o.op == "set_section_room"}
    exact = dict(pins_exact or {})
    merged_inst_pins = {**sc.instructor_pins, **(instructor_pins or {})}

    load_caps = {i.id: i.max_sections for i in sc.instructors}
    prep_caps = {i.id: i.max_preps for i in sc.instructors}
    for o in ops:
        if o.op == "set_load_cap" and o.instructor_id and o.value is not None:
            load_caps[o.instructor_id] = o.value
        if o.op == "set_prep_cap" and o.instructor_id and o.value is not None:
            prep_caps[o.instructor_id] = o.value

    prefs: list[tuple[str, InstructorPreference]] = [
        (i.id, p) for i in sc.instructors for p in i.preferences]
    for o in ops:
        if o.op == "add_instructor_preference" and o.instructor_id:
            prefs.append((o.instructor_id, InstructorPreference(
                kind=o.kind or "avoid", day=o.day, period=o.period,
                course_id=o.course_id, weight=o.weight or 10)))

    def penalty(sid: str, iid: str, key: int, rid: str) -> int:
        if objective == "room_fit":
            section = sc.section_by_id(sid)
            return sc.room(rid).capacity - sc.enrollment_for_section(section)
        if objective == "balanced_load":
            return 0  # handled at the leaf (max load), not additively
        course_id = sc.section_by_id(sid).course_id
        pattern = sc.course(course_id).pattern
        days = PATTERN_DAYS[pattern] if pattern in ("MWF", "TTh") else [key]
        periods = [key] if pattern in ("MWF", "TTh") else list(BLOCK_PERIODS)
        total = 0
        for pi, pref in prefs:
            if pi != iid:
                continue
            if pref.period is not None:
                if pref.period in periods:
                    total += pref.weight if pref.kind == "avoid" else -pref.weight
            elif pref.day is not None:
                if pref.day in days:
                    total += pref.weight if pref.kind == "avoid" else -pref.weight
            if pref.course_id is not None and pref.course_id == course_id:
                total += pref.weight if pref.kind == "avoid" else -pref.weight
        return total

    def allowed(sid: str, opt) -> bool:
        iid, key, rid = opt
        if sid in exact and exact[sid] != opt:
            return False
        if sid in merged_inst_pins and sid not in op_inst_sections and sid not in exact:
            if iid != merged_inst_pins[sid]:
                return False
        if sid in sc.room_pins and sid not in op_room_sections and sid not in exact:
            if rid != sc.room_pins[sid]:
                return False
        for o in ops:
            if o.op == "add_instructor_unavailability" and iid == o.instructor_id \
                    and _covers(sc, sid, key, o.day, o.period):
                return False
            if o.op == "add_room_unavailability" and rid == o.room_id \
                    and _covers(sc, sid, key, o.day, o.period):
                return False
            if o.op == "add_term_closure" and _covers(sc, sid, key, o.day, o.period):
                return False
            if o.op == "set_section_instructor" and sid == o.section_id and iid != o.instructor_id:
                return False
            if o.op == "set_section_room" and sid == o.section_id and rid != o.room_id:
                return False
            if o.op == "remove_instructor" and iid == o.instructor_id:
                return False
            if o.op == "update_enrollment" and sid == o.section_id \
                    and sc.room(rid).capacity < (o.value or 0):
                return False
        return True

    domains: dict[str, list[tuple[str, int, str]]] = {}
    for s in sc.sections:
        domains[s.id] = [o for o in _options(sc, s) if allowed(s.id, o)]

    slots = {sid: {key: _slots_of(sc, sid, key)
                   for (_, key, _) in domains[sid]} for sid in domains}
    # slot sets per (section, key) — keys repeat across instructor/room opts
    for s in sc.sections:
        keys = {o[1] for o in _options(sc, s)}
        slots.setdefault(s.id, {}).update({k: _slots_of(sc, s.id, k) for k in keys})

    pairs = sc.demanded_section_pairs()
    pair_partners: dict[str, list[str]] = {}
    for sa, sb in pairs:
        pair_partners.setdefault(sa.id, []).append(sb.id)
        pair_partners.setdefault(sb.id, []).append(sa.id)

    section_cohorts: dict[str, list[str]] = {}
    for c in sc.cohorts:
        for cid in sc.cohort_term_courses(c):
            for s in sc.sections_of_course(cid):
                section_cohorts.setdefault(s.id, []).append(c.id)

    return {
        "domains": domains, "slots": slots, "pairs": pairs,
        "pair_partners": pair_partners, "section_cohorts": section_cohorts,
        "load_caps": load_caps, "prep_caps": prep_caps, "penalty": penalty,
        # Student-credit load (C15b): enrollment x credits with the policy's
        # sub-linear student curve. A section cap alone underprices a
        # 180-student lecture.
        "load_units": {s.id: sc.section_load_units(s) for s in sc.sections},
        "load_caps_units": {i.id: sc.instructor_load_cap(i) for i in sc.instructors},
    }


class _Search:
    def __init__(self, sc: Scenario, prep: dict, objective: str,
                 slot_hints: Optional[dict[str, int]], deadline: float):
        self.sc = sc
        self.objective = objective
        self.deadline = deadline
        self.domains = prep["domains"]
        self.slots = prep["slots"]
        self.pair_partners = prep["pair_partners"]
        self.section_cohorts = prep["section_cohorts"]
        self.load_caps = prep["load_caps"]
        self.prep_caps = prep["prep_caps"]
        self.load_units = prep["load_units"]
        self.load_caps_units = prep["load_caps_units"]
        self.penalty = prep["penalty"]
        self.hints = slot_hints or {}

        self.course_of = {s.id: s.course_id for s in sc.sections}
        self.building_of_room = {r.id: r.building_id for r in sc.rooms}
        # ordered domains: least penalty first, hint-matching slots early
        self.ordered: dict[str, list] = {}
        self.lb: dict[str, int] = {}
        for sid, opts in self.domains.items():
            scored = sorted(opts, key=lambda o: (
                self.penalty(sid, *o), 0 if self.hints.get(sid) == o[1] else 1,
                o[0], o[1], o[2]))
            self.ordered[sid] = scored
            self.lb[sid] = min((self.penalty(sid, *o) for o in scored), default=0)

        self.assignment: dict[str, tuple[str, int, str]] = {}
        self.inst_busy: set[tuple[str, int, int]] = set()
        self.room_busy: set[tuple[str, int, int]] = set()
        self.inst_load: dict[str, int] = {}
        self.inst_weight: dict[str, float] = {}
        self.inst_preps: dict[str, set[str]] = {}
        self.cohort_day: dict[tuple[str, int], int] = {}
        self.current_penalty = 0
        self.best: Optional[dict[str, tuple[str, int, str]]] = None
        self.best_objective: Optional[int] = None
        self.timed_out = False
        self.nodes = 0

    # -- viability of one option against the partial assignment -------------
    def _ok(self, sid: str, opt) -> bool:
        iid, key, rid = opt
        occupied = self.slots[sid][key]
        if any((iid, d, p) in self.inst_busy for d, p in occupied):
            return False
        if any((rid, d, p) in self.room_busy for d, p in occupied):
            return False
        if self.inst_load.get(iid, 0) + 1 > self.load_caps[iid]:
            return False
        if (self.inst_weight.get(iid, 0.0) + self.load_units[sid]
                > self.load_caps_units[iid] + 1e-9):
            return False
        course_id = self.course_of[sid]
        preps = self.inst_preps.get(iid, set())
        if course_id not in preps and len(preps) + 1 > self.prep_caps[iid]:
            return False
        for cid in self.section_cohorts.get(sid, []):
            for d, _ in occupied:
                if self.cohort_day.get((cid, d), 0) + 1 > 2:
                    return False
        for other in self.pair_partners.get(sid, []):
            if other not in self.assignment:
                continue
            o_iid, o_key, o_rid = self.assignment[other]
            other_slots = self.slots[other][o_key]
            if occupied & other_slots:
                return False
            # C32 walk: same-pattern demanded pair, back-to-back periods,
            # buildings too far apart
            pa = self.sc.course(self.course_of[sid]).pattern
            pb = self.sc.course(self.course_of[other]).pattern
            if pa == pb and pa in ("MWF", "TTh") and abs(key - o_key) == 1:
                b1 = self.building_of_room[rid]
                b2 = self.building_of_room[o_rid]
                if self.sc.distances[b1][b2] > self.sc.walk_limit_min:
                    return False
        return True

    def _assign(self, sid: str, opt) -> None:
        iid, key, rid = opt
        self.assignment[sid] = opt
        occupied = self.slots[sid][key]
        for d, p in occupied:
            self.inst_busy.add((iid, d, p))
            self.room_busy.add((rid, d, p))
        self.inst_load[iid] = self.inst_load.get(iid, 0) + 1
        self.inst_weight[iid] = self.inst_weight.get(iid, 0.0) + self.load_units[sid]
        self.inst_preps.setdefault(iid, set()).add(self.course_of[sid])
        for cid in self.section_cohorts.get(sid, []):
            for d in {d for d, _ in occupied}:
                self.cohort_day[(cid, d)] = self.cohort_day.get((cid, d), 0) + 1
        self.current_penalty += self.penalty(sid, *opt)

    def _unassign(self, sid: str, opt) -> None:
        iid, key, rid = opt
        del self.assignment[sid]
        occupied = self.slots[sid][key]
        for d, p in occupied:
            self.inst_busy.discard((iid, d, p))
            self.room_busy.discard((rid, d, p))
        self.inst_load[iid] -= 1
        self.inst_weight[iid] = self.inst_weight.get(iid, 0.0) - self.load_units[sid]
        course_id = self.course_of[sid]
        if not any(s != sid and a[0] == iid and self.course_of[s] == course_id
                   for s, a in self.assignment.items()):
            self.inst_preps.get(iid, set()).discard(course_id)
        for cid in self.section_cohorts.get(sid, []):
            for d in {d for d, _ in occupied}:
                self.cohort_day[(cid, d)] -= 1
        self.current_penalty -= self.penalty(sid, *opt)

    # -- local improvement: hill-climb the incumbent ---------------------------
    def _restore(self, snap: dict) -> None:
        self.inst_busy.clear(); self.room_busy.clear()
        self.inst_load.clear(); self.inst_weight.clear()
        self.inst_preps.clear(); self.cohort_day.clear()
        self.assignment = {}
        self.current_penalty = 0
        for sid, opt in snap.items():
            self._assign(sid, opt)

    def _blockers(self, sid: str, opt) -> list[str]:
        """Assigned sections that alone stand between `sid` and `opt`
        (instructor/room slot clash or a demanded-pair overlap)."""
        iid, key, rid = opt
        occupied = self.slots[sid][key]
        out = []
        for other, (oi, okey, orid) in self.assignment.items():
            if other == sid:
                continue
            oslots = self.slots[other][okey]
            if (oi == iid or orid == rid) and occupied & oslots:
                out.append(other)
            elif other in self.pair_partners.get(sid, []) and occupied & oslots:
                out.append(other)
        return out

    def _improve(self, budget_s: float = 3.0) -> None:
        """Hill-climb: single-section moves to any feasible lower-penalty
        option, then ejection moves (one blocker section re-homed so a
        stuck section can take its preferred slot). This closes the last
        penalty points pure branch-and-bound crawls for."""
        if self.best is None or self.objective == "balanced_load":
            return
        deadline = min(self.deadline, time.perf_counter() + budget_s)
        self._restore(dict(self.best))
        improved = True
        while improved and time.perf_counter() < deadline:
            improved = False
            # single-section moves
            for sid in sorted(self.ordered):
                current = self.assignment[sid]
                cur_pen = self.penalty(sid, *current)
                self._unassign(sid, current)
                best_opt, best_pen = current, cur_pen
                for opt in self.ordered[sid]:
                    pen = self.penalty(sid, *opt)
                    if pen < best_pen and self._ok(sid, opt):
                        best_opt, best_pen = opt, pen
                self._assign(sid, best_opt)
                if best_opt != current:
                    improved = True
            # ejection moves: one blocker makes room
            if not improved:
                for sid in sorted(self.ordered):
                    if time.perf_counter() > deadline:
                        break
                    cur_pen = self.penalty(sid, *self.assignment[sid])
                    if cur_pen <= self.lb[sid]:
                        continue
                    snap = dict(self.assignment)
                    done = False
                    for opt in self.ordered[sid]:
                        if self.penalty(sid, *opt) >= cur_pen:
                            break
                        blockers = self._blockers(sid, opt)
                        if len(blockers) != 1:
                            continue
                        b = blockers[0]
                        b_pen = self.penalty(b, *self.assignment[b])
                        self._restore({k: v for k, v in snap.items() if k not in (sid, b)})
                        if not self._ok(sid, opt):
                            self._restore(snap)
                            continue
                        self._assign(sid, opt)
                        placed = False
                        for b_opt in self.ordered[b]:
                            if self.penalty(b, *b_opt) + self.penalty(sid, *opt) < b_pen + cur_pen \
                                    and self._ok(b, b_opt):
                                self._assign(b, b_opt)
                                placed = True
                                break
                        if placed:
                            improved = done = True
                            break
                        self._restore(snap)
                    if done:
                        break
        self.best = dict(self.assignment)
        self.best_objective = self.current_penalty
        # leave the search state clean for branch-and-bound
        self._restore({})
        self.assignment = {}

    # -- branch and bound -----------------------------------------------------
    def run(self, quick: bool = False) -> None:
        self._dfs(first_only=True)   # greedy descent: MRV + least-penalty first
        if quick:
            return                   # greedy engine: first layout, no polish
        self._improve()              # hill-climb the incumbent
        if not self.timed_out:
            self._dfs()              # branch-and-bound: beat it or prove it
        return None

    def _dfs(self, first_only: bool = False) -> bool:
        """Returns True when the subtree is proven exhausted (optimality)."""
        if self.timed_out:
            return False
        self.nodes += 1
        if self.nodes % 256 == 0 and time.perf_counter() > self.deadline:
            self.timed_out = True
            return False

        if len(self.assignment) == len(self.ordered):
            if self.objective == "balanced_load":
                obj = max(self.inst_weight.values(), default=0.0)
            else:
                obj = self.current_penalty
            if self.best_objective is None or obj < self.best_objective:
                self.best_objective = obj
                self.best = dict(self.assignment)
            return False

        # admissible bound: current + sum of per-section minima
        if self.objective != "balanced_load" and self.best_objective is not None:
            bound = self.current_penalty + sum(
                self.lb[s] for s in self.ordered if s not in self.assignment)
            if bound >= self.best_objective:
                return False
        if self.objective == "balanced_load" and self.best_objective is not None:
            if max(self.inst_weight.values(), default=0.0) >= self.best_objective:
                return False

        # MRV over live domains (forward checking falls out of the count)
        chosen, chosen_opts = None, None
        for sid in sorted(self.ordered):
            if sid in self.assignment:
                continue
            viable = [o for o in self.ordered[sid] if self._ok(sid, o)]
            if chosen_opts is None or len(viable) < len(chosen_opts):
                chosen, chosen_opts = sid, viable
                if len(viable) <= 1:
                    break
        if chosen is None or not chosen_opts:
            return True  # dead end, fully explored

        exhausted = True
        for opt in chosen_opts:
            self._assign(chosen, opt)
            if not self._dfs(first_only):
                exhausted = False
            self._unassign(chosen, opt)
            if first_only and self.best is not None:
                return True  # greedy phase: first complete timetable is enough
            if self.timed_out:
                return False
            # incumbent hit the global lower bound: nothing can beat it
            if self.best_objective is not None and self.objective != "balanced_load":
                global_lb = sum(self.lb.values())
                if self.best_objective <= global_lb:
                    return True
        return exhausted


def _conflict_core(sc: Scenario, ops: list[Operation], pins_exact,
                   instructor_pins, objective: str, deadline: float) -> list[int]:
    """Deletion minimization: drop every op the infeasibility doesn't need."""
    core = list(range(len(ops)))
    for i in list(core):
        trial = [ops[j] for j in core if j != i]
        remaining_deadline = min(deadline, time.perf_counter() + HOME_TIME_LIMIT_S)
        res = solve_home(sc, trial, pins_exact=pins_exact,
                         instructor_pins=instructor_pins, objective=objective,
                         _deadline=remaining_deadline, _core=False)
        if res.status == "infeasible":
            core.remove(i)
    return sorted(core)


def build_timetable(sc: Scenario, best: dict) -> tuple[Timetable, dict[str, int]]:
    """Placements + per-instructor counts for an assignment dict
    (section_id -> (instructor_id, slot_key, room_id)). Shared by the
    Python search and the native C++ core so both emit identical output."""
    placements: list[Placement] = []
    counts: dict[str, int] = {}
    for s in sc.sections:
        iid, key, rid = best[s.id]
        course = sc.course(s.course_id)
        inst = sc.instructor(iid)
        room = sc.room(rid)
        if course.pattern in ("MWF", "TTh"):
            days, period, periods = PATTERN_DAYS[course.pattern], key, [key]
        else:
            days, period, periods = [key], None, list(BLOCK_PERIODS)
        start_period = period if period is not None else periods[0]
        placements.append(Placement(
            section_id=s.id, course_id=course.id, course_code=course.code,
            instructor_id=iid, instructor_name=inst.name,
            days=days, period=period, periods=periods,
            duration=course.duration_hours(),
            enrollment=sc.enrollment_for_section(s),
            start_time=period_start_time(start_period),
            end_time=period_end_time(start_period, course.duration_hours()),
            room_id=room.id, room_name=room.name, building_id=room.building_id))
        counts[iid] = counts.get(iid, 0) + 1
    for i in sc.instructors:
        counts.setdefault(i.id, 0)
    return Timetable(placements=placements, sections_per_instructor=counts), counts


def solve_home(sc: Scenario, request_ops: Optional[list[Operation]] = None,
               pins_exact: Optional[dict] = None,
               instructor_pins: Optional[dict[str, str]] = None,
               slot_hints: Optional[dict[str, int]] = None,
               objective: str = "preference",
               quick: bool = False,
               _deadline: Optional[float] = None,
               _core: bool = True) -> SolveResult:
    t0 = time.perf_counter()
    ops = list(request_ops or [])
    if slot_hints is None:
        try:
            from app.intelligence.spectral import analyze
            slot_hints = analyze(sc).slot_hints
        except Exception:  # noqa: BLE001 — hints are advisory, never required
            slot_hints = None
    deadline = _deadline or (t0 + HOME_TIME_LIMIT_S)
    prep = _prepare(sc, ops, pins_exact, instructor_pins, objective)
    search = _Search(sc, prep, objective, slot_hints, deadline)
    search.run(quick=quick)
    elapsed_ms = int((time.perf_counter() - t0) * 1000)

    if search.best is not None:
        timetable, counts = build_timetable(sc, search.best)
        # A quick (greedy-only) run stops by design after the first descent;
        # it is only "optimal" if the incumbent meets the admissible bound.
        proven = search.best_objective is not None and (
            search.best_objective <= sum(search.lb.values())
            or (not quick and not search.timed_out))
        return SolveResult(
            status="optimal" if proven else "feasible",
            timetable=timetable,
            objective=search.best_objective,
            objective_name=objective,
            solve_time_ms=elapsed_ms,
        )

    if ops and _core and not search.timed_out:
        core_idx = _conflict_core(sc, ops, pins_exact, instructor_pins, objective, deadline)
        if core_idx:
            named = " / ".join(f"'{ops[i].explanation}'" for i in core_idx)
            return SolveResult(
                status="infeasible",
                conflicts=ConflictReport(
                    conflicting_operation_indices=core_idx,
                    explanation=f"These requests cannot hold together (with the base rules): {named}.",
                    suggestion="Drop or relax one of the conflicting requests and re-solve."),
                solve_time_ms=int((time.perf_counter() - t0) * 1000))
    if search.timed_out:
        # Budget expired with no incumbent and no proof: "unknown",
        # never a fabricated infeasibility claim.
        return SolveResult(status="unknown", solve_time_ms=elapsed_ms)
    return SolveResult(
        status="infeasible",
        conflicts=ConflictReport(
            conflicting_operation_indices=[],
            explanation="Infeasible against the base scenario (no request could fix this).",
            suggestion="Relax room inventory, loads, or hard unavailability."),
        solve_time_ms=elapsed_ms)
