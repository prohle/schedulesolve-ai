#!/usr/bin/env python3
"""Solver performance + feasibility audit.

Runs every registered engine on the deterministic institution tiers and on
seeded realistic randomized variants, independently verifies every timetable,
and records status, objective, wall time, C39 margin, room utilization,
faculty student-load and cross-engine agreement.

    cd backend
    .venv/bin/python scripts/solver_audit.py --seeds 0-9 --include-built

Outputs:
  docs/solver_performance.md          human-readable record (committed)
  backend/artifacts/solver_audit.json raw records (reproducible)
  backend/artifacts/solver_audit.csv  flat table
"""

from __future__ import annotations

import argparse
import csv
import json
import statistics
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import config
from app.data.department import (
    build_comprehensive_scenario,
    build_department_scenario,
    build_full_university_scenario,
    build_university_scenario,
)
from app.data.random_scenario import build_random_scenario
from app.data.realism import audit_scenario
from app.intelligence.load import instructor_loads
from app.intelligence.matrices import compute_margins, compute_utilization
from app.main import load_seed_scenario
from app.solver.engine import ENGINE_IDS, solve_with
from app.solver.verify import timetable_signature, verify_timetable


def _p95(values: list[float]) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, int(round(0.95 * (len(ordered) - 1))))
    return ordered[index]


def _parse_seeds(text: str) -> list[int]:
    seeds: list[int] = []
    for part in text.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            lo, hi = part.split("-", 1)
            seeds.extend(range(int(lo), int(hi) + 1))
        else:
            seeds.append(int(part))
    return seeds


def _built_instances() -> list[tuple[str, object]]:
    seed = load_seed_scenario()
    return [
        ("built: story seed", seed),
        ("built: department", build_department_scenario(seed)),
        ("built: university", build_university_scenario(seed)),
        ("built: Northgate (default)", build_comprehensive_scenario(seed)),
        ("built: full university (stress)", build_full_university_scenario(seed)),
    ]


def run(
    instances: list[tuple[str, object]],
    engines: list[str],
    objectives: list[str],
) -> list[dict]:
    records: list[dict] = []
    for name, sc in instances:
        realism = audit_scenario(sc)
        for objective in objectives:
            per_engine: dict[str, dict] = {}
            per_engine_result: dict[str, object] = {}
            for engine in engines:
                t0 = time.perf_counter()
                try:
                    result = solve_with(engine, sc, objective=objective)
                    error = ""
                except Exception as exc:  # noqa: BLE001 — an engine crash is a result
                    result = None
                    error = f"{type(exc).__name__}: {exc}"
                wall_ms = int((time.perf_counter() - t0) * 1000)
                violations = verify_timetable(sc, result) if result and result.timetable else []
                margins = compute_margins(
                    sc, result.timetable if result else None,
                    config.MIN_COURSES_PER_COHORT)
                util = compute_utilization(sc, result.timetable if result else None)
                loads = instructor_loads(sc, result.timetable if result else None)
                record = {
                    "instance": name,
                    "kind": "built" if name.startswith("built:") else "random",
                    "seed": sc.name.rsplit("seed ", 1)[-1]
                    if "seed " in sc.name else "",
                    "sections": len(sc.sections),
                    "cohorts": len(sc.cohorts),
                    "instructors": len(sc.instructors),
                    "rooms": len(sc.rooms),
                    "realism_errors": len(realism.errors),
                    "realism_warnings": len(realism.warnings),
                    "objective": objective,
                    "engine": engine,
                    "status": result.status if result else "error",
                    "objective_value": result.objective if result else None,
                    "solve_time_ms": result.solve_time_ms if result else None,
                    "wall_ms": wall_ms,
                    "placements": len(result.timetable.placements)
                    if result and result.timetable else 0,
                    "valid": (True if result and result.timetable and not violations
                              else False if result and result.timetable else None),
                    "violations": violations[:10],
                    "c39_ok": margins.all_ok if result and result.timetable else None,
                    "c39_met": sum(c.ok for c in margins.cohorts),
                    "c39_total": len(margins.cohorts),
                    "room_utilization": util.room_utilization,
                    "load_overloaded": len(loads.overloaded),
                    "load_max_utilization": max(
                        (r.utilization for r in loads.instructors), default=0.0),
                    "error": error,
                }
                per_engine[engine] = record
                per_engine_result[engine] = result
                records.append(record)

            # Cross-engine agreement against the best available timetable.
            baseline = next(
                (per_engine[e] for e in engines
                 if per_engine.get(e, {}).get("valid")
                 and per_engine[e]["status"] in ("optimal", "feasible")),
                None)
            if baseline is not None:
                base_sig = timetable_signature(
                    per_engine_result[baseline["engine"]])
                for engine, record in per_engine.items():
                    if not record["valid"]:
                        record["agreement_pct"] = None
                        continue
                    sig = timetable_signature(per_engine_result[engine])
                    common = set(base_sig) | set(sig)
                    same = sum(1 for sid in common
                               if base_sig.get(sid) == sig.get(sid))
                    record["agreement_pct"] = round(
                        100.0 * same / max(1, len(common)), 1)
            else:
                for record in per_engine.values():
                    record["agreement_pct"] = None
    return records


def summarize(records: list[dict], engines: list[str]) -> list[dict]:
    rows = []
    for engine in engines:
        mine = [r for r in records if r["engine"] == engine]
        status = {s: sum(1 for r in mine if r["status"] == s)
                  for s in ("optimal", "feasible", "infeasible", "unknown", "error")}
        walls = [r["wall_ms"] for r in mine]
        gaps = [
            r["objective_value"] - best
            for r in mine
            if r["objective_value"] is not None
            and (best := _best_objective(records, r["instance"], r["objective"])) is not None
        ]
        rows.append({
            "engine": engine,
            "runs": len(mine),
            **status,
            "valid": sum(1 for r in mine if r["valid"] is True),
            "no_timetable": sum(1 for r in mine if r["valid"] is None),
            "median_wall_ms": int(statistics.median(walls)) if walls else 0,
            "p95_wall_ms": int(_p95(walls)),
            "mean_gap": round(statistics.mean(gaps), 2) if gaps else None,
            "c39_ok": sum(1 for r in mine if r["c39_ok"]),
            "load_overloads": sum(1 for r in mine if r["load_overloaded"]),
        })
    return rows


def _best_objective(records: list[dict], instance: str, objective: str):
    values = [
        r["objective_value"] for r in records
        if r["instance"] == instance and r["objective"] == objective
        and r["objective_value"] is not None
    ]
    return min(values) if values else None


def write_markdown(records: list[dict], summary: list[dict],
                   engines: list[str], path: Path) -> None:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    lines = [
        "# Solver performance audit",
        "",
        f"Generated by `backend/scripts/solver_audit.py` on {now}. "
        "Every timetable below was independently re-checked from its placements "
        "(`app/solver/verify.py`), not trusted from the engine's status.",
        "",
        "## Aggregate",
        "",
        "| Engine | Runs | Optimal | Feasible | Infeasible | Unknown | Valid | "
        "No timetable | Median wall | p95 wall | Mean gap | C39 ok | Load overloads |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for row in summary:
        lines.append(
            f"| {row['engine']} | {row['runs']} | {row['optimal']} | "
            f"{row['feasible']} | {row['infeasible']} | {row['unknown']} | "
            f"{row['valid']} | {row['no_timetable']} | {row['median_wall_ms']} ms | "
            f"{row['p95_wall_ms']} ms | "
            f"{row['mean_gap'] if row['mean_gap'] is not None else '—'} | "
            f"{row['c39_ok']} | {row['load_overloads']} |")

    lines += [
        "",
        "## Per-instance results",
        "",
        "| Instance | Sections | Objective | Engine | Status | Obj. | Wall | "
        "Valid | C39 | Agreement | Load max |",
        "|---|---:|---|---|---|---:|---:|---|---:|---:|---:|",
    ]
    for record in records:
        lines.append(
            f"| {record['instance']} | {record['sections']} | "
            f"{record['objective']} | {record['engine']} | {record['status']} | "
            f"{record['objective_value'] if record['objective_value'] is not None else '—'} | "
            f"{record['wall_ms']} ms | "
            f"{'—' if record['valid'] is None else ('yes' if record['valid'] else 'NO')} | "
            f"{record['c39_met']}/{record['c39_total']} | "
            f"{record['agreement_pct'] if record['agreement_pct'] is not None else '—'} | "
            f"{record['load_max_utilization']:.2f} |")

    lines += [
        "",
        "## How to reproduce",
        "",
        "```bash",
        "cd backend",
        ".venv/bin/python scripts/solver_audit.py --seeds 0-9 --include-built",
        "```",
        "",
        "Raw records: `backend/artifacts/solver_audit.json` and `.csv`.",
        "",
        "Statuses are honest by construction: a timeout is `unknown`, never "
        "`infeasible`; a greedy-only run is `feasible` unless its incumbent "
        "meets the admissible lower bound. A `NO` in the Valid column means a "
        "returned timetable violated a hard constraint (a solver bug); `—` "
        "means the engine honestly returned no timetable (infeasible/unknown).",
        "",
    ]
    path.write_text("\n".join(lines))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--seeds", default="0-9",
                        help="comma/range list for randomized instances (default 0-9)")
    parser.add_argument("--base", default="department",
                        choices=["department", "comprehensive"],
                        help="randomized instance base (default department)")
    parser.add_argument("--engines", default=",".join(ENGINE_IDS))
    parser.add_argument("--objectives", default="preference")
    parser.add_argument("--include-built", action="store_true")
    parser.add_argument("--time-limit", type=float, default=15.0)
    parser.add_argument("--home-limit", type=float, default=8.0)
    parser.add_argument("--workers", type=int, default=1)
    parser.add_argument("--out", default=str(Path(__file__).resolve().parents[1] / "artifacts"))
    parser.add_argument("--doc", default=str(
        Path(__file__).resolve().parents[2] / "docs" / "solver_performance.md"))
    args = parser.parse_args()

    config.SOLVER_TIME_LIMIT_S = args.time_limit
    config.HOME_SOLVER_TIME_LIMIT_S = args.home_limit
    config.SOLVER_WORKERS = max(1, args.workers)
    engines = [e.strip() for e in args.engines.split(",") if e.strip()]
    objectives = [o.strip() for o in args.objectives.split(",") if o.strip()]

    instances: list[tuple[str, object]] = []
    if args.include_built:
        instances.extend(_built_instances())
    for seed in _parse_seeds(args.seeds):
        instances.append((f"random: {args.base} seed {seed}",
                          build_random_scenario(seed, base=args.base)))

    records = run(instances, engines, objectives)
    summary = summarize(records, engines)

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "solver_audit.json").write_text(json.dumps({
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "engines": engines,
        "objectives": objectives,
        "summary": summary,
        "records": records,
    }, indent=2))
    with (out_dir / "solver_audit.csv").open("w", newline="") as handle:
        fields = [k for k in records[0] if k != "violations"] if records else []
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(records)

    write_markdown(records, summary, engines, Path(args.doc))

    print(f"{'Engine':24s} {'runs':>4s} {'opt':>4s} {'feas':>5s} "
          f"{'infeas':>6s} {'unk':>4s} {'valid':>5s} {'median':>8s} {'p95':>8s}")
    for row in summary:
        print(f"{row['engine']:24s} {row['runs']:4d} {row['optimal']:4d} "
              f"{row['feasible']:5d} {row['infeasible']:6d} {row['unknown']:4d} "
              f"{row['valid']:5d} {row['median_wall_ms']:7d}ms "
              f"{row['p95_wall_ms']:7d}ms")
    print(f"\nwrote {args.doc}")
    print(f"wrote {out_dir / 'solver_audit.json'}")
    print(f"wrote {out_dir / 'solver_audit.csv'}")


if __name__ == "__main__":
    main()
