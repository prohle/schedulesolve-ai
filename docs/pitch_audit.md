# Pitch audit — `local_final_pitch.md` vs. the repository

Measured **2026-11-01** against the running repo. The benchmark below was
re-run with `backend/scripts/benchmark.py`; every row is single-worker,
deterministic, and independently re-checked from its placements
(`docs/solver_performance.md`, `backend/artifacts/solver_audit.json`).

## Verdict summary

| # | Claim in the pitch | Reality / evidence | Verdict |
|---|---|---|---|
| 1 | “thousands of students, more than a hundred faculty at full scale” | Full-university stress: **198 instructors · 361 sections · 100 cohorts · 25 programs · ~12,000 students** (`docs/solver_performance.md`, benchmark). Default institution: 148 instructors, 110 cohorts. | **True** |
| 2 | “rooms across a campus you cannot cross in ten minutes” | `Scenario.walk_limit_min = 10`; the solver enforces the walk matrix between back-to-back classes (`backend/app/models/scenario.py`, `backend/app/solver/scheduling_model.py`). | **True** |
| 3 | “Muse Spark autocleans … and flags contradictory or missing inputs” | Autoclean is real (six formats → typed model). **Missing inputs** are reported by `check_completeness` (six required inputs). **Contradictions are not detected at ingestion**; contradiction arbitration exists in the student plan (`record_vs_lookup`, `must_vs_availability`, `must_already_completed`). | **Partial** — say “reports exactly which of the six required inputs are missing”; keep contradiction claims for the student plan. |
| 4 | “Faculty add hard constraints and soft preferences in plain language” | `backend/app/parsing/parser.py`, `backend/app/services/term.py`; per-professor structured intake grid + free-text. | **True** |
| 5 | “One sentence … becomes schema-validated operations applied to the term” | `validate_operations` → `apply_operations`; the co-pilot only commits after a solve. | **True** |
| 6 | “Two engines race … Google OR-Tools CP-SAT and a native C++ solver we built” | `backend/native/schedulesolve_solver.cpp`, `backend/app/solver/engine.py`, `GET /engines`, `POST /solve` with `engine`. | **True** |
| 7 | “ranked from outputs alone: status, penalty, speed” | `backend/app/solver/engine.py` ranking; compare view. | **True** |
| 8 | “native solver proves the same optimum in **29 ms vs 153 ms**; at 361 sections it alone finishes in **3.3 s**” | **Stale.** Re-measured 2026-11-01: story seed 6 ms vs 69 ms; department **19 ms vs 164 ms**; university **35 ms vs 140 ms**; 361-section stress **5.9 s** vs CP-SAT `unknown` after 63.2 s. Same objective at every demo scale. | **Stale** — replace with the measured numbers. |
| 9 | “coordinator publishes; instructors see only their sections; students their cohort's courses” | `GET /schedule/mine` role filter; `backend/tests/test_auth.py`. | **True** |
| 10 | “Chen leaves; probes every qualified instructor; ranks by feasibility, load, preference; pins every unaffected placement; only affected sections move” | `backend/app/services/term_change.py` (`propose_candidates`, `pins_exact`), tests. | **True** |
| 11 | “assumption literals isolate the minimal conflict core; Muse translates; every repair is re-solved; least disruptive proven fix auto-applied” | `backend/app/solver/scheduling_model.py` (`SufficientAssumptionsForInfeasibility`), `backend/app/services/copilot.py` (`options`, `best = options[0]`, auto-apply). | **True** |
| 12 | “student pastes a study record … verified plan + projected graduation term, on track or pushed out by a named course” | `backend/app/services/student_plan.py`, `StudentPlanConflict`, tests (`test_projection_names_the_course_that_delays_a_senior`). | **True** |
| 13 | “Faculty see their load and preference impact” | `/schedule/mine` load payload; instructor intake panel. | **True** |
| 14 | “Muse Voice Transcribe drafts voice notes” | `backend/app/services/voice.py`; draft-only, identity from session, never auto-applied. | **True** |
| 15 | “open-weight Muse Spark Open on Baseten, **custom-aligned schema outputs locally with 0 ms round-trip API overhead** and **guaranteed on-premise data privacy**” | Open-weights path is real and verified: `backend/muse-verification-open.json` — 18/18 live calls on `meta-models/muse-spark-open-1026` at `https://inference.baseten.co/v1`. But the calls are **hosted** and carry real network latency (seconds, captured in the file). There is no 0 ms round-trip and no on-premise guarantee on the Baseten path. | **Overclaim** — say “verified 18/18 structured calls on open-weight Muse Spark Open served by Baseten; the client is endpoint-agnostic, so the same stack can self-host the open weights for data privacy.” |
| 16 | “open-source codebase, setup guide, benchmark scripts on GitHub” | Public repo, `readme.md`, `backend/scripts/benchmark.py`, `backend/scripts/solver_audit.py`. | **True** |
| 17 | “built during the hackathon” | `docs/submission.md` “What was built during the hackathon”; commit history Oct 27–Nov 4. | **True** |

## Re-measured solver table (2026-11-01)

| Scenario | Instructors | Sections | CP-SAT | Native C++ (`ours`) | Python ref |
|---|---:|---:|---|---|---|
| Story seed | 6 | 8 | optimal 69 ms · −6 | **optimal 6 ms · −6** | optimal 47 ms · −6 |
| Department | 26 | 25 | optimal 164 ms · −40 | **optimal 19 ms · −40** | feasible 30,011 ms · −40 |
| University | 38 | 41 | optimal 140 ms · −40 | **optimal 35 ms · −40** | feasible 30,007 ms · −40 |
| Full university (stress) | 198 | 361 | unknown 63,194 ms · — | **optimal 5,903 ms · −40** | unknown 91,543 ms · — |

At every demo scale the two engines return the **same proven objective**; the
native core proves it faster. At 361 sections CP-SAT reports `unknown` inside
its budget while the native core still proves the optimum. C39 holds 100/100
at stress scale.

## Corrected pitch language

- **Keep:** the pain story, the file-to-model story, the two-engine race, the
  zero-ripple term change, the minimal conflict core, the student plan, the
  voice draft, the open-source close.
- **Replace the solver numbers** with the measured table above (or the single
  line “department 19 ms vs 164 ms; university 35 ms vs 140 ms; 361 sections
  5.9 s vs CP-SAT unknown”).
- **Replace “contradictory or missing inputs” at ingestion** with “reports
  exactly which of the six required inputs are missing.” Contradictions are a
  student-plan feature and should be described there.
- **Replace the Baseten paragraph** with the verified open-weights claim:
  18/18 structured calls on Muse Spark Open served by Baseten; endpoint-agnostic
  client; self-hosting is the data-privacy path. Do not claim 0 ms round-trip
  or guaranteed on-premise inference on the hosted path.
