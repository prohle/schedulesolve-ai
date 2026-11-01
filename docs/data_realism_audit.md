# Data realism audit

This audit was run because "solvable" is not the same as "realistic". The
default institution was solvable while containing data a coordinator would
reject on day one. Every finding below is now a regression test
(`backend/tests/test_realism.py`) and a check in
`backend/app/data/realism.py`.

## What the audit found (before)

`audit_scenario(build_comprehensive_scenario(...))` reported **426 errors**:

| Finding | Count | Why it matters |
|---|---:|---|
| Courses with only one qualified instructor | 166 | One illness cancels the course; a real department has cover |
| Sections whose projected enrollment exceeded their own seat cap | 120 | The room/capacity constraint was being fed impossible data |
| Cohorts whose degree map had no courses for their current term | 20 | Term-7 cohorts were invisible to demand and advising |
| Demand exceeded one section × seat cap (C5) | 120 | The offering decision ignored the sections it needed |
| Every instructor had `max_sections=2`, `max_preps=2` | 118 | No teaching/research track distinction, no load variation |
| Degree maps had 2 courses per term (6 per degree) | 20 | Not a full-time load; C39 only passed through open electives |
| "Walk distance" was derived from ASCII sums of building ids | all pairs | Numbers had no geographic meaning |
| Module-level fixtures shared by reference | — | Building one tier silently edited another tier's degree maps |

The full-university stress tier had the same single-qualified-course defect
(166 courses), and its 361 sections needed 800 large-hall room-slots but only
22 halls existed — a real capacity infeasibility that the old benchmark hid.

## What changed

- **Full-time degree maps.** Each major cohort takes two major courses plus two
  shared college service courses per term (4 courses / 12+ credits). The five
  original university programs were given the same treatment.
- **College service courses.** Five colleges run eight shared gen-ed courses
  each, one large section per course (no phantom multi-section cohorts that
  the C7 model cannot represent). Enrollment is 100-230 students.
- **Graduate layer.** Five master's and five PhD programs, small cohorts,
  graduate-only faculty, 35 PhD students, and five approved 1-3 credit
  supervisor reservations. Population mix is bachelor-dominated by design.
- **Qualification cover.** Every offered course has at least two qualified
  instructors; graduate faculty are separate from undergraduate faculty so
  prep/section caps cannot starve a major.
- **Real seats.** Course seat caps are set from projected enrollment and are
  bounded by the largest room that can actually host the course.
- **Faculty tracks and student load.** Research/teaching tracks, per-instructor
  student-credit caps, and a sub-linear load curve (80 students ≈ 1.6× a
  40-student class, not 2×).
- **Geographic walk matrix.** Campus centres + deterministic building offsets,
  symmetric, 2-22 minutes, with the 10-minute walk limit still enforced.
- **Room supply.** The default campus has 83 rooms (27 seminar, 27 lab, 29
  lecture) including five 240-seat halls; the stress campus has 82 rooms,
  enough large halls for 320 cohort-sized lectures.
- **Catalog records.** Term-scoped `CourseOffering` records for offered,
  not-offered, dormant, and special-topic courses, with reason, department,
  recorder and timestamp.
- **Calendar policy.** National-holiday suggestions, term start/end
  suggestions, and "Friday follows Tuesday" make-up swaps, all stored as
  editable records.

## Randomized feasibility input

`backend/app/data/random_scenario.py` builds seeded realistic variants:
cohort sizes by level, faculty tracks/caps, seat resizing, preferences,
blackouts, closures, post-add/drop enrollment, catalog pauses and special
topics. Each variant must pass the same realism audit before a solver sees it.
The same seed is byte-for-byte reproducible.

`backend/scripts/data_audit.py` runs the realism checklist over the built tiers
and randomized seeds; it exits non-zero on any error. `backend/scripts/solver_audit.py` runs CP-SAT, the native solver and greedy on
the built tiers plus randomized seeds, independently verifies every timetable,
and records status/objective/time/C39/room utilization/student load/agreement.
See `docs/solver_performance.md` and `backend/artifacts/`.

## Current result

- All built tiers: **0 realism errors** (seed/department/university have only
  documented thin-term warnings; the default institution and stress tier are
  clean).
- Randomized comprehensive seeds 0-9: **0 errors, 0 warnings** (randomized department variants inherit the demo slice's thin-term warnings, never errors).
- Every returned timetable in the audit passes independent hard-constraint
  verification; no engine overloads a faculty student-load cap.
- Random seed 0 is genuinely infeasible (a random closure/blackout removes the
  only legal placement for a section); all three engines agree on
  `infeasible`, which is the correct cross-check.

## Honest limits

- The scheduling model still uses the four 90-minute base grid for solves.
  `TimeGrid` and `MeetingPattern` are coordinator-editable and persisted, and
  custom weekly/block patterns are representable, but a fully mixed-duration
  interval schedule (50/80/170-minute classes sharing one day) is the next
  solver upgrade; see `docs/limitations.md`.
- Load units are a policy abstraction (credits × sub-linear enrollment), not a
  timesheet. Coordinators can change the exponent, multiplier, full-time
  threshold and track factors.
- PhD reservations are durable records and eligibility checks; they are not
  placed into the weekly timetable (independent study has no fixed meeting).
- National holidays are advisory; every date is stored as an editable record.
