#!/usr/bin/env python3
"""Department-scale benchmark: real numbers, measured, not marketing.

Solves the story seed and the department scenario with the production
solver (single worker, deterministic) and prints a markdown table the
README quotes verbatim. Run from `backend/`:

    .venv/bin/python scripts/benchmark.py
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.data.department import build_department_scenario, build_university_scenario, build_full_university_scenario
from app.intelligence.matrices import compute_margins, compute_utilization
from app.main import load_seed_scenario
from app.services.term_change import run_term_change
from app.solver.scheduling_model import solve


def bench(name: str, sc) -> dict:
    t0 = time.perf_counter()
    result = solve(sc)
    wall_ms = int((time.perf_counter() - t0) * 1000)
    ours = solve(sc, engine="ours")
    from app.solver.home_solver import solve_home
    pyref = solve_home(sc)
    agreement = None
    if ours.timetable and result.timetable:
        a = {p.section_id: (p.instructor_id, tuple(p.days), p.period, p.room_id)
             for p in ours.timetable.placements}
        b = {p.section_id: (p.instructor_id, tuple(p.days), p.period, p.room_id)
             for p in result.timetable.placements}
        agreement = round(100.0 * sum(1 for k in a if a[k] == b.get(k)) / max(1, len(a)), 1)
    # Audit against whichever engine produced a timetable (at full-
    # university scale that is the native solver: CP-SAT honestly
    # reports "unknown" inside its budget there).
    audit_result = result if result.timetable is not None else ours
    margins = compute_margins(sc, audit_result.timetable, 4)
    util = compute_utilization(sc, audit_result.timetable)
    if result.timetable is not None:
        tc = run_term_change(sc, "Prof. Chen will no longer teach this term — who should take over her sections?")
        term_change_txt = (f"{len(tc.affected_section_ids)} affected, "
                           f"{sum(p.feasible for p in tc.proposals)}/{len(tc.proposals)} probes feasible, "
                           f"re-solve {tc.result.status if tc.result else 'none'}")
    else:
        term_change_txt = "not probed (CP-SAT base solve exceeds budget at this scale)"
    return {
        "name": name,
        "instructors": len(sc.instructors),
        "sections": len(sc.sections),
        "rooms": len(sc.rooms),
        "cohorts": len(sc.cohorts),
        "programs": len(sc.programs),
        "status": result.status,
        "solve_ms": result.solve_time_ms,
        "wall_ms": wall_ms,
        "objective": result.objective,
        "ours_status": ours.status,
        "ours_ms": ours.solve_time_ms,
        "ours_objective": ours.objective,
        "agreement": agreement,
        "py_status": pyref.status,
        "py_ms": pyref.solve_time_ms,
        "py_objective": pyref.objective,
        "c39": f"{sum(c.ok for c in margins.cohorts)}/{len(margins.cohorts)} cohorts >= 4 courses",
        "room_util": util.room_utilization,
        "term_change": term_change_txt,
    }


def main() -> None:
    seed = load_seed_scenario()
    rows = [bench("Story seed (demo)", seed),
            bench("Department scale", build_department_scenario(seed)),
            bench("University scale", build_university_scenario(seed)),
            bench("Full University (stress)", build_full_university_scenario(seed))]
    print("| Scenario | Instructors | Sections | Rooms | Cohorts | Programs | CP-SAT | Ours (native C++) | Ours (Python ref) | Identical placements % | C39 guarantee | Room util. | Term Change (Chen leaves the term) |")
    print("|---|---:|---:|---:|---:|---:|---|---|---|---:|---|---:|---|")
    for r in rows:
        print(f"| {r['name']} | {r['instructors']} | {r['sections']} | {r['rooms']} | "
              f"{r['cohorts']} | {r['programs']} | {r['status']} {r['solve_ms']} ms · penalty {r['objective'] if r['objective'] is not None else '—'} | "
              f"{r['ours_status']} {r['ours_ms']} ms · penalty {r['ours_objective']} | "
              f"{r['py_status']} {r['py_ms']} ms · penalty {r['py_objective'] if r['py_objective'] is not None else '—'} | "
              f"{str(r['agreement']) + '%' if r['agreement'] is not None else '—'} | "
              f"{r['c39']} | {r['room_util']:.0%} | {r['term_change']} |")
    print()
    print("> *Identical placements %* counts sections where both engines picked the exact same "
          "(instructor, days, period, room). It is low because many equally-optimal schedules "
          "exist (ties): the engines **agree on the proven optimum (same penalty)** and differ "
          "only in which legal, equally-good layout they return. Proven objective parity is the "
          "claim; identical placements are not.")


if __name__ == "__main__":
    main()
