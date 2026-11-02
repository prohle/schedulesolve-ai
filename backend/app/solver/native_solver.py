"""Native engine: the AI-authored C++ search core (backend/native/).

Domains, penalties, option ordering, and caps come from the exact same
preparation code the Python reference solver uses (`home_solver._prepare` /
`_Search`), so CP-SAT, the Python solver, and this native core differ only
in search — a level playing field. The C++ binary runs the identical
algorithm (greedy descent -> single/ejection hill-climb -> branch-and-bound
with an admissible bound) at native speed, which is what lets it *prove*
optimality at department/university scale inside the time budget where
the Python search can only return a feasible incumbent.

Protocol: one JSON payload on stdin (integer indices only), one JSON
result on stdout. Build with `backend/scripts/build_native.sh`; when the
binary is absent the `ours` engine falls back to the Python search.
"""

from __future__ import annotations

import json
import os
import subprocess
import time
from pathlib import Path
from typing import Optional

from app import config
from app.models.results import ConflictReport, SolveResult, operation_source
from app.models.scenario import Operation, Scenario
from app.solver.home_solver import _Search, _prepare, build_timetable

BINARY = Path(os.getenv(
    "NATIVE_SOLVER_PATH",
    str(Path(__file__).resolve().parents[2] / "native" / "solver")))

_OBJ_CODE = {"preference": 0, "room_fit": 1, "balanced_load": 2}


def native_available() -> bool:
    return BINARY.exists() and os.access(BINARY, os.X_OK)


def _payload(sc: Scenario, search: _Search, objective: str,
             time_limit_ms: int, quick: bool) -> dict:
    inst_idx = {i.id: n for n, i in enumerate(sc.instructors)}
    room_idx = {r.id: n for n, r in enumerate(sc.rooms)}
    course_idx = {c.id: n for n, c in enumerate(sc.courses)}
    cohort_idx = {c.id: n for n, c in enumerate(sc.cohorts)}
    bld_idx = {b.id: n for n, b in enumerate(sc.buildings)}
    sec_idx = {s.id: n for n, s in enumerate(sc.sections)}

    sections = []
    for s in sc.sections:
        opts = []
        for (iid, key, rid) in search.ordered[s.id]:
            mask = 0
            for (d, p) in search.slots[s.id][key]:
                mask |= 1 << (d * 8 + p)
            opts.append({
                "i": inst_idx[iid], "k": key, "r": room_idx[rid],
                "pen": search.penalty(s.id, iid, key, rid), "mask": mask,
                "bld": bld_idx[sc.room(rid).building_id]})
        sections.append({
            "course": course_idx[s.course_id],
            "cohorts": [cohort_idx[c] for c in search.section_cohorts.get(s.id, [])],
            # Student-credit load weight, scaled to an integer (C++ parser is
            # integer-only). 1000 = one load unit.
            "weight": int(round(search.load_units[s.id] * 1000)),
            "options": opts})

    pairs = []
    for sa, sb in sc.demanded_section_pairs():
        pa = sc.course(sa.course_id).pattern
        pb = sc.course(sb.course_id).pattern
        pairs.append({"a": sec_idx[sa.id], "b": sec_idx[sb.id],
                      "walk": pa == pb and pa in ("MWF", "TTh")})

    # Section pairs that can contend (shared candidate instructor, or a
    # demanded cohort pair): the native pairwise-conflict bound uses these.
    inst_sets = {}
    for s in sc.sections:
        inst_sets[s.id] = {o[0] for o in search.domains.get(s.id, [])}
    bound_pairs = []
    secs = sc.sections
    for a in range(len(secs)):
        for b in range(a + 1, len(secs)):
            if inst_sets[secs[a].id] & inst_sets[secs[b].id]:
                bound_pairs.append({"a": a, "b": b})
    demanded = {(sec_idx[sa.id], sec_idx[sb.id]) for sa, sb in sc.demanded_section_pairs()}
    have = {(p["a"], p["b"]) for p in bound_pairs}
    for a, b in sorted(demanded):
        if (a, b) not in have:
            bound_pairs.append({"a": a, "b": b})

    return {
        "time_limit_ms": time_limit_ms,
        "quick": quick,
        "objective": _OBJ_CODE[objective],
        "walk_limit": sc.walk_limit_min,
        "n_rooms": len(sc.rooms),
        "n_cohorts": len(sc.cohorts),
        "instructors": [{"load": search.load_caps[i.id], "prep": search.prep_caps[i.id],
                         "sload": int(round(search.load_caps_units[i.id] * 1000))}
                        for i in sc.instructors],
        "sections": sections,
        "pairs": pairs,
        "bound_pairs": bound_pairs,
        "dist": [[sc.distances[a.id][b.id] for b in sc.buildings] for a in sc.buildings],
    }


def _run(payload: dict, timeout_s: float) -> dict:
    proc = subprocess.run(
        [str(BINARY)], input=json.dumps(payload),
        capture_output=True, text=True, timeout=timeout_s)
    if proc.returncode != 0:
        raise RuntimeError(f"native solver failed: {proc.stderr[:300]}")
    return json.loads(proc.stdout)


def _conflict_core(sc: Scenario, ops: list[Operation], pins_exact,
                   instructor_pins, objective: str, deadline: float) -> list[int]:
    core = list(range(len(ops)))
    for i in list(core):
        trial = [ops[j] for j in core if j != i]
        res = solve_native(sc, trial, pins_exact=pins_exact,
                           instructor_pins=instructor_pins, objective=objective,
                           _deadline=min(deadline, time.perf_counter() + config.HOME_SOLVER_TIME_LIMIT_S),
                           _core=False)
        if res.status == "infeasible":
            core.remove(i)
    return sorted(core)


def solve_native(sc: Scenario, request_ops: Optional[list[Operation]] = None,
                 pins_exact: Optional[dict] = None,
                 instructor_pins: Optional[dict[str, str]] = None,
                 slot_hints: Optional[dict[str, int]] = None,
                 objective: str = "preference",
                 quick: bool = False,
                 _deadline: Optional[float] = None,
                 _core: bool = True) -> SolveResult:
    t0 = time.perf_counter()
    ops = list(request_ops or [])
    # Same spectral warm start CP-SAT gets. Without it, a 241-section
    # institution with shared gen-ed sections can spend the whole budget
    # before its first incumbent; with it the same instance proves optimal in
    # under two seconds.
    if slot_hints is None:
        try:
            from app.intelligence.spectral import analyze
            slot_hints = analyze(sc).slot_hints
        except Exception:  # noqa: BLE001 — hints are advisory, never required
            slot_hints = None
    # The search budget scales with instance size: 5 s is generous at
    # demo scale, but a 361-section proof on a small cloud CPU needs
    # more. (Conflict-core trials pass an explicit deadline and are
    # unaffected.)
    budget_s = config.HOME_SOLVER_TIME_LIMIT_S * (
        4 if len(sc.sections) > 200 else 2 if len(sc.sections) > 80 else 1)
    deadline = _deadline or (t0 + budget_s)
    prep = _prepare(sc, ops, pins_exact, instructor_pins, objective)
    search = _Search(sc, prep, objective, slot_hints, deadline)
    limit_ms = max(1, int((deadline - time.perf_counter()) * 1000))
    out = _run(_payload(sc, search, objective, limit_ms, quick),
               timeout_s=limit_ms / 1000 + 15)
    elapsed_ms = int((time.perf_counter() - t0) * 1000)

    if out.get("assignment"):
        best = {}
        for s, oi in zip(sc.sections, out["assignment"]):
            best[s.id] = search.ordered[s.id][oi]
        timetable, _counts = build_timetable(sc, best)
        return SolveResult(
            status="optimal" if out.get("proven") else "feasible",
            timetable=timetable,
            objective=out.get("objective"),
            objective_name=objective,
            solve_time_ms=elapsed_ms)

    if ops and _core and not out.get("timed_out"):
        core_idx = _conflict_core(sc, ops, pins_exact, instructor_pins, objective, deadline)
        if core_idx:
            named = " / ".join(f"'{ops[i].explanation}'" for i in core_idx)
            return SolveResult(
                status="infeasible",
                conflicts=ConflictReport(
                    conflicting_operation_indices=core_idx,
                    explanation=f"These requests cannot hold together (with the base rules): {named}.",
                    suggestion="Drop or relax one of the conflicting requests and re-solve.",
                    sources=[operation_source(ops[i]) for i in core_idx]),
                solve_time_ms=int((time.perf_counter() - t0) * 1000))
    if out.get("timed_out"):
        # Budget expired with no incumbent and no proof: "unknown",
        # never a fabricated infeasibility claim.
        return SolveResult(status="unknown", solve_time_ms=elapsed_ms)
    return SolveResult(
        status="infeasible",
        conflicts=ConflictReport(
            conflicting_operation_indices=[],
            explanation="Infeasible against the base scenario (no request could fix this).",
            suggestion="Relax room inventory, loads, or hard unavailability.",
            sources=["Institution model (base scenario): the conflict is in "
                     "the standing rules, not in any submitted request."]),
        solve_time_ms=elapsed_ms)
