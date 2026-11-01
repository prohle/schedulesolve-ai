# Truthfulness audit

A claim-by-claim audit of what is real, what is synthetic, and what is
deliberately illustrative. Written so a judge can verify each line in the
code or by calling the API.

## Real, and verifiable

| Claim | Evidence |
|---|---|
| OR-Tools CP-SAT is the default solver | `backend/app/solver/scheduling_model.py`; `GET /engines` |
| A second native C++ solver exists | `backend/native/schedulesolve_solver.cpp`; `docs/solver_evidence.md` |
| Hard constraints are enforced | capacity, room type, equipment, blackouts, closures, qualifications, load/prep caps, cohort conflicts, walk limit; audited by `backend/tests/test_university_facts.py` |
| Statuses are honest | `optimal` / `feasible` / `infeasible` / `unknown`; a timeout is never reported as infeasible |
| Building utilization is computed from placements | `backend/app/services/term.py` (`building_utilization`), `backend/app/intelligence/matrices.py`; peak simultaneous occupancy |
| Building utilization can drive the solve | `building_balance` objective in `scheduling_model.py`; minimized max simultaneous building occupancy |
| Published schedules are real solves | `POST /schedule/publish` calls `solve(...)` and stores the placements |
| Intake window + submissions are durable | `term_windows`, `faculty_intake` in Postgres |
| Institution model is durable | `institution_state` in Postgres; survives restarts |
| Auth is real PBKDF2 + hashed bearer sessions | `backend/app/services/auth.py` |
| Audit trail records submissions/events | `submissions`, `events` tables; `GET /history` |
| Muse Spark is live when a key is set | `MUSE_API_KEY` set in the running container; `parser.mode = "muse-spark"`; mock fallback is visibly labelled |
| Import/autoclean is bounded by the source | no OCR; unreadable files produce `[unreadable]`; completeness check names missing inputs |
| Tests pass | `backend/tests` (realism, randomized, policy, API, solver parity) |

## Synthetic or simulated — labelled as such

| Item | What it really is | Where it is labelled |
|---|---|---|
| Northgate University (148 faculty, 271 courses/sections, 110 cohorts, 35 PhD students, 14 buildings, 9 campuses) | Generated demo data, not a real registrar extract | **Demo institution** badge; `docs/limitations.md`; `docs/data_realism_audit.md` |
| Faculty feedback from "Simulate all" | Randomised constraints/preferences, deterministic per professor | Note "Simulated faculty feedback (demo)." |
| First-page preview charts (88.6%, 361 sections, 48 faculty) | Design-reference sample data, not the live model | **Illustrative sample** badge + subtitle |
| Marketing landing page (`/`) campus demo, facility cards, ROI sliders | Procedural demo campus + illustrative projections, not the live institution | "Demo telemetry", "Illustrative campus", "Illustrative projection" labels; sign-in CTA |
| Analytics modal "benchmark" | Animation only; no solver call | "Illustrative preview — sign in for the live solver" |
| "Live telemetry" labels on the landing matrix | Procedural demo campus on the first page; live model inside the app | Preview badge; app uses live scenario/placements |

## Limited by design (not hidden)

| Area | Boundary |
|---|---|
| Weeks / holidays | The solver assigns a weekly pattern. The University Calendar layer stores real dated holidays and day swaps ("Friday follows Tuesday"), maps each date to the effective pattern and audits meeting shortfalls. It is not an official registrar calendar. |
| University calendar dates | Term start is set by the coordinator; end = start + weeks. Holidays/swaps are real dates; the default demo calendar starts empty. |
| "Map" | Campus/building cards grouped by quad, not a geographic map. |
| Degree maps | Synthetic programs/cohorts; they drive demand and cohort conflicts, but they are not real accreditation records. |
| Minors | First-class programs for catalog/degree-map display; they do not create cohorts or demand on their own. |
| Auth | Demo-grade (PBKDF2 + bearer sessions), not institutional SSO. |
| SIS / ERP integration | A REST API and CSV export are shipped; they are designed to map into Banner, Workday, PeopleSoft or Canvas through the campus's existing data workflows. Vendor-specific bidirectional connectors are not shipped. |
| Projected graduation term | Estimate from the degree-map depth, the student's completed record, locked prerequisites and the verified plan; it is not an official registrar audit. The student panel states the inputs it used, names missing inputs, and surfaces contradictory record/lookup or course/availability information as a choice the student makes. |
| Hosted demo persistence | The public Modal demo uses a single-tenant SQLite volume (zero-setup live URL); the Docker stack uses Postgres 18. |
| Scale | CP-SAT proves the default 271-section institution; the 361-section stress tier is a separate benchmark where CP-SAT may report `unknown` inside its 60 s budget. |
| Auto-publish | Removed from Save options; it was stored but not acted on. |
| Engines | Two real engines (CP-SAT, native C++) plus greedy. There is no Z3/SMT engine. |
| Faculty load | Student-credit load (credits × sub-linear enrollment) with research/teaching tracks; coordinator-owned policy, audited from placements. |
| Catalog decisions | Offered / not-offered / dormant / special-topic records with reason and timestamp. |
| PhD reservations | PhD-only, Fall-only, 1-3 credits, 3-5 students per professor per Fall. |
| Calendar | National-holiday and term-date suggestions; editable holidays and Friday-follows-Tuesday swaps. |
| Time grid | Coordinator-editable periods/patterns stored in the scenario; solver uses the default four-slot grid for placement. |

## Claims removed in this audit

The landing copy previously claimed a "Z3 SMT" engine, a "dual SAT/CP race",
and hard-coded timings (`0.034s` / `0.038s`). None of that was true. The copy
now names the real engines and says timings are shown after a signed-in solve.
The preview no longer presents `361 / 48 / 88.6%` as live results; it is
labelled illustrative sample data. The public marketing page (`/`) follows the
same rule: its procedural campus is labelled **Demo telemetry / Illustrative
campus**, its ROI is labelled an illustrative projection, and the engine copy
names CP-SAT plus the native C++ solver (29 ms university solve; 3.3 s at the
361-section stress tier).

## How to verify

```bash
# real engines
curl -s localhost:8011/engines | jq

# real solve + status
curl -s -X POST localhost:3000/api/solve -H 'Content-Type: application/json' \
  -d '{"engine":"cpsat"}' | jq '{status, sections: (.timetable.placements|length), solve_time_ms}'

# real utilization for the current term
TOKEN=...  # coordinator login
curl -s localhost:3000/api/institution/overview -H "Authorization: Bearer $TOKEN" \
  | jq '.building_utilization'

# the audit itself
cd backend && .venv/bin/python -m pytest tests/test_university_facts.py -q
```
