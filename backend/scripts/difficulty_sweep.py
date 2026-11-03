#!/usr/bin/env python3
"""Difficulty sweep: where does each engine stop proving?

A single instance is not evidence that one solver is better — it is one sample.
This sweeps the two axes that actually make timetabling hard:

* **size** — seed (8 sections) → department (25) → university (41) → full
  university (361);
* **demand pressure** — at university scale, grow every cohort (×1, ×2, ×3,
  ×5) so the same rooms must absorb more students.

Each cell is one solve per engine under the same budget, so the comparison is
like-for-like. Output is a markdown table the README can quote.

    cd backend && .venv/bin/python scripts/difficulty_sweep.py
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import config
from app.data.department import (
    build_department_scenario,
    build_full_university_scenario,
    build_university_scenario,
)
from app.main import load_seed_scenario
from app.solver.native_solver import native_available, solve_native
from app.solver.scheduling_model import solve as solve_cpsat

BUDGET_S = 20.0


def run(engine: str, scenario) -> tuple[str, int, object]:
    started = time.perf_counter()
    if engine == "cpsat":
        result = solve_cpsat(scenario, engine="cpsat")
    else:
        result = solve_native(scenario)
    elapsed = int((time.perf_counter() - started) * 1000)
    return (
        getattr(result, "status", "unknown"),
        elapsed,
        getattr(result, "objective", None),
    )


def row(label: str, scenario) -> str:
    cpsat_status, cpsat_ms, cpsat_obj = run("cpsat", scenario)
    ours_status, ours_ms, ours_obj = run("ours", scenario)
    same = "—"
    if cpsat_status == "optimal" and ours_status == "optimal":
        same = "yes" if cpsat_obj == ours_obj else f"no ({cpsat_obj} vs {ours_obj})"
    return (
        f"| {label} | {len(scenario.sections)} | {cpsat_status} · {cpsat_ms} ms | "
        f"{ours_status} · {ours_ms} ms | {same} |"
    )


def main() -> int:
    config.SOLVER_TIME_LIMIT_S = BUDGET_S
    config.HOME_SOLVER_TIME_LIMIT_S = BUDGET_S
    if not native_available():
        print("native solver not built — run scripts/build_native.sh first")
        return 1

    seed = load_seed_scenario()
    department = build_department_scenario(seed)
    university = build_university_scenario(seed)
    stress = build_full_university_scenario(seed)

    print(f"Budget: {BUDGET_S:.0f}s per solve.\n")
    print("| Instance | Sections | CP-SAT | C-Solve | Same optimum? |")
    print("|---|---:|---|---|---|")
    print(row("Seed (demo)", seed))
    print(row("Department", department))
    print(row("University", university))
    print(row("Full university (stress)", stress))

    print("\nDemand pressure at university scale (every cohort grows):\n")
    print("| Cohorts | Sections | CP-SAT | C-Solve | Same optimum? |")
    print("|---|---:|---|---|---|")
    for factor in (1, 2, 3, 5):
        scenario = university.model_copy(deep=True)
        for cohort in scenario.cohorts:
            cohort.size = max(1, int(cohort.size * factor))
        scenario.name = f"University ×{factor} demand"
        print(row(f"×{factor} demand", scenario))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
