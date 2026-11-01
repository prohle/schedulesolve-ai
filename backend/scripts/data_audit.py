#!/usr/bin/env python3
"""Data-realism audit CLI.

    cd backend
    .venv/bin/python scripts/data_audit.py            # all tiers
    .venv/bin/python scripts/data_audit.py --seeds 0-9
    .venv/bin/python scripts/data_audit.py --json

Exit code 1 if any scenario has a realism error (warnings do not fail).
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.data.department import (
    build_comprehensive_scenario,
    build_department_scenario,
    build_full_university_scenario,
    build_university_scenario,
)
from app.data.random_scenario import build_random_scenario
from app.data.realism import audit_scenario
from app.main import load_seed_scenario


def _seeds(text: str) -> list[int]:
    out: list[int] = []
    for part in text.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            lo, hi = part.split("-", 1)
            out.extend(range(int(lo), int(hi) + 1))
        else:
            out.append(int(part))
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--seeds", default="0-9",
                        help="randomized seeds (comma/range); empty to skip")
    parser.add_argument("--base", default="department",
                        choices=["department", "comprehensive"])
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    seed = load_seed_scenario()
    instances = [
        ("story seed", seed),
        ("department", build_department_scenario(seed)),
        ("university", build_university_scenario(seed)),
        ("Northgate (default)", build_comprehensive_scenario(seed)),
        ("full university (stress)", build_full_university_scenario(seed)),
    ]
    for n in _seeds(args.seeds):
        instances.append((f"random {args.base} seed {n}",
                          build_random_scenario(n, base=args.base)))

    reports = []
    failed = False
    for name, scenario in instances:
        report = audit_scenario(scenario)
        failed = failed or not report.ok
        reports.append({
            "name": name,
            "scenario": scenario.name,
            "counts": report.counts(),
            "errors": [i.as_dict() for i in report.errors],
            "warnings": [i.as_dict() for i in report.warnings],
        })
        if not args.json:
            print(f"{name:34s} {report.summary()}")
            for issue in report.errors:
                print(f"  ERROR [{issue.code}] {issue.entity}: {issue.message}")
            by_code = Counter(i.code for i in report.warnings)
            if by_code:
                print(f"  warnings: {dict(by_code)}")

    if args.json:
        print(json.dumps(reports, indent=2))
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
