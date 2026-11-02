# Pitch audit — `local_final_pitch.md` vs. the repository

Measured **2026-11-01** against the current repo (pitch file untouched).
The benchmark below was re-run with `backend/scripts/benchmark.py`; every
row is single-worker, deterministic, and independently re-checked from its
placements. Solver timings vary by machine — the pitch figures and the
re-measured figures agree within run-to-run variance on this laptop.

## Verdict summary

| # | Claim in the pitch | Reality / evidence | Verdict |
|---|---|---|---|
| 1 | Full scale: 198 faculty, 361 sections, 100 cohorts, ~12,000 students | Full-university stress: **198 instructors · 361 sections · 82 rooms · 100 cohorts · 25 programs · 12,530 students** (`backend/scripts/benchmark.py`). | **True** |
| 2 | "rooms across a campus you cannot cross in ten minutes" | `Scenario.walk_limit_min = 10`; the solver enforces the walk matrix between back-to-back classes (`backend/app/models/scenario.py`, `backend/app/solver/scheduling_model.py`). | **True** |
| 3 | Phase 1: Muse autocleans, flags contradictory information, helps resolve it, reports exactly which required inputs are missing | Autoclean is real (PDF/DOCX/XLSX/CSV/JSON/TXT/MD/ZIP → typed model). Missing inputs: `check_completeness` names the missing of the six required inputs. Contradictions: `detect_conflicts` returns each disagreement with the **source file/section of both sides** and electable winners (`resolve_conflicts`, gated in the Import wizard — no silent winners); degree-map disagreements are detected too. | **True** |
| 4 | "Professor Patel cannot teach Mondays" becomes schema-validated operations applied to the term | `validate_operations` → co-pilot solve → `apply_operations`; only solver-proven operations are committed. | **True** |
| 5 | Phase 2: the LLM never touches the schedule; native C++ ScheduleSolve solver races CP-SAT, ranked from outputs alone (status, penalty, speed) | `backend/native/schedulesolve_solver.cpp`, `backend/app/solver/engine.py` (`rank_results`: proven status → penalty → speed), Build-step Rank 1 / Rank 2 compare. | **True** |
| 6 | Department 20 ms vs 144 ms; university 37 ms vs 159 ms; 361 sections: ours alone proves optimal in 6.1 s, CP-SAT unknown | Re-measured 2026-11-01: department **19 ms vs 154 ms**, university **39 ms vs 147 ms**, full university **optimal 5,832 ms vs CP-SAT `unknown` (63.3 s wall, 60 s budget)** — same proven penalty (−40) at every demo scale. Pitch figures are within machine/run variance of these. | **True** (machine-dependent) |
| 7 | Every timetable audited: each cohort can assemble ≥4 non-conflicting courses; 100/100 at full scale | C39 audit (`compute_margins`); benchmark: story 2/4 (tightener demo world), department 12/12, university 20/20, full 100/100. | **True** |
| 8 | Phase 3: Chen leaves; solver probes every qualified instructor for zero-ripple coverage, ranks by feasibility/load/preference delta, pins unaffected placements, only affected sections move; no unproven name suggested | `propose_candidates` (CP-SAT probe per candidate, everything else frozen), `pins_exact` on unaffected sections. Candidates carry their roster source; the coordinator may elect any *feasible* proposal per section (unproven elections are refused, re-solve re-proves the elected set). | **True** |
| 9 | Phase 4: minimal conflict core isolated; Muse translates; repairs ranked by disruption; every repair re-solved before shown; least-disruptive proven fix auto-applied; trace names every actor | Assumption literals (`SufficientAssumptionsForInfeasibility`) + deletion-minimized cores in the other engines; `run_copilot` verifies each resolution by re-solving, auto-applies option 1 as the default, and returns every verified option with the **source of each conflicting request** so the coordinator can elect a different winner. `agent_trace` names the actor per step. | **True** |
| 10 | Phase 5: professors sign in before the deadline, elect hard/soft constraints; coordinator accepts, solver re-proves, publishes; instructors see only their sections, students their cohort's | Intake window + per-professor grid, `POST /term/window/accept`, publish, role-filtered `GET /schedule/mine`. | **True** |
| 11 | Student: pastes a study record, chooses a degree, gets a verified plan + projected graduation term (on track, or pushed out by a named course); if record and cohort lookup disagree, the student chooses which wins | `suggest_student_plan`: exact selector re-verified before shown; `project_graduation` names the delaying course; `StudentPlanConflict` (record vs lookup, must-take vs availability, already-completed) lists both sources and electable options. | **True** |
| 12 | Muse Voice Transcribe drafts voice notes for human review | `POST /term-change/audio` returns a draft only; identity comes from the signed-in session. | **True** |
| 13 | Muse Spark Open on Baseten verified 18/18 live calls; endpoint-agnostic client, self-host by configuration alone | `backend/muse-verification-open.json`: 18/18 structured calls on `meta-models/muse-spark-open-1026`; `MUSE_BASE_URL` + `MUSE_MODEL` swap, no code change. No 0 ms / on-premise claim is made for the hosted path. | **True** |

## Re-measured solver table (2026-11-01, this laptop)

| Scenario | Instructors | Sections | CP-SAT | Native C++ (`ours`) | Python ref |
|---|---:|---:|---|---|---|
| Story seed | 6 | 8 | optimal 72 ms · −6 | **optimal 12 ms · −6** | optimal 46 ms · −6 |
| Department | 26 | 25 | optimal 154 ms · −40 | **optimal 19 ms · −40** | feasible 30,002 ms · −40 (unproven) |
| University | 38 | 41 | optimal 147 ms · −40 | **optimal 39 ms · −40** | feasible 30,018 ms · −40 (unproven) |
| Full university (stress) | 198 | 361 | unknown 63,342 ms · — | **optimal 5,832 ms · −40** | unknown (budget) |

At every demo scale the two engines return the **same proven objective**;
the native core proves it faster on this problem class. At 361 sections
CP-SAT reports `unknown` inside its 60 s budget while the native core still
proves the optimum. C39 holds 100/100 at stress scale.
