#!/usr/bin/env python3
"""Docs consistency gate — the README may not drift from the code.

Three checks, all cheap enough to run on every push:

1. **Test count.** The badge in `readme.md` must equal the number of tests the
   suite actually collects. (This drifted from 108 to 131 once; it should not
   happen twice.)
2. **Links.** Every relative link in every tracked markdown file must resolve.
   A judge clicking a dead `docs/...` link is a silent credibility loss.
3. **Corrected claims.** A denylist of phrases we have already had to fix —
   contradictions that were live in the repo at some point — must not return.

Run from the repo root:

    python backend/scripts/check_docs.py
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"

# Phrases that were once true, or once wrongly claimed, and must stay gone.
DENY = [
    "no SQLite mode",
    "no OCR;",
    "108 tests",
    "107 backend",
    "12 Buildings",
    "78.4",
    "88.6% Peak",
    "≥12m",
    "18:30+ Fit",
    "live Puppeteer screencast",
    "local-demo/",
    "License: MIT",
]

# Numbers retired from the marketing landing page. Once corrected they must
# stay corrected in UI copy too, not just the markdown docs — this is the
# third "one number everywhere" miss (README, solver_evidence.md, landing page).
FRONTEND_DENY = [
    "29 ms",      # university solve is 35 ms
    "3.3 s",      # stress tier is 5.6 s
    "12-minute",  # walk limit is 10 minutes
    "≥12 mins",   # same, in the formula strings
]

LINK_RE = re.compile(r"\]\((\.{0,2}/?[^)#\s]+\.(?:md|png|jpg|jpeg|svg))\)")


def tracked_markdown() -> list[Path]:
    out = subprocess.run(
        ["git", "ls-files", "*.md"], cwd=ROOT, capture_output=True, text=True
    ).stdout
    return [ROOT / line for line in out.split() if line]


def tracked_frontend_src() -> list[Path]:
    out = subprocess.run(
        ["git", "ls-files"], cwd=ROOT, capture_output=True, text=True
    ).stdout
    return [
        ROOT / line
        for line in out.split()
        if line.startswith("frontend/src/") and line.endswith((".ts", ".tsx"))
    ]


def collected_tests() -> int:
    proc = subprocess.run(
        [sys.executable, "-m", "pytest", "--collect-only", "-q"],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    match = re.search(r"(\d+) tests? collected", proc.stdout)
    if match is None:
        raise SystemExit(
            "check_docs: could not read the collected test count\n"
            f"{proc.stdout[-800:]}\n{proc.stderr[-800:]}"
        )
    return int(match.group(1))


def main() -> int:
    problems: list[str] = []
    files = tracked_markdown()
    readme = (ROOT / "readme.md").read_text()

    # 1. badge vs reality
    badge = re.search(r"tests-(\d+)%20passing", readme)
    actual = collected_tests()
    if badge is None:
        problems.append("readme.md: no test badge found")
    elif int(badge.group(1)) != actual:
        problems.append(
            f"readme.md: badge says {badge.group(1)} tests, suite collects {actual}"
        )

    # 2. relative links resolve
    for path in files:
        text = path.read_text(errors="ignore")
        for target in LINK_RE.findall(text):
            if target.startswith("http"):
                continue
            resolved = (path.parent / target).resolve()
            if not resolved.exists():
                problems.append(f"{path.relative_to(ROOT)}: broken link -> {target}")

    # 3. corrected claims stay corrected
    for path in files:
        text = path.read_text(errors="ignore")
        for phrase in DENY:
            if phrase in text:
                problems.append(f"{path.relative_to(ROOT)}: stale claim -> {phrase!r}")

    # 4. retired landing-page numbers stay retired in UI copy too
    for path in tracked_frontend_src():
        text = path.read_text(errors="ignore")
        for phrase in FRONTEND_DENY:
            if phrase in text:
                problems.append(f"{path.relative_to(ROOT)}: stale frontend claim -> {phrase!r}")

    if problems:
        print("docs consistency: FAILED")
        for problem in problems:
            print(f"  - {problem}")
        return 1

    print(f"docs consistency: ok ({len(files)} files, {actual} tests, links resolve)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
