# Solver evidence: an AI-authored rival to CP-SAT, proven

## The claim, scoped honestly

ScheduleSolve ships two independent solvers behind one interface
(`GET /engines`, `POST /solve` with `engine`, one `SolveResult` shape):

- **CP-SAT** (`cpsat`) — Google's industrial C++ constraint solver.
- **Ours** (`ours`) — an AI-authored solver built for this problem class:
  a native **C++17 search core** (`backend/native/schedulesolve_solver.cpp`)
  fed domains/penalties by the same preparation code CP-SAT's model uses,
  so the engines differ *only in search*. A Python reference implementation
  of the same algorithm (`backend/app/solver/home_solver.py`) remains as
  the readable specification and as fallback when the binary is unbuilt.
- **Greedy** (`greedy`) — the first descent only, to show what the
  optimization phases buy.

**Why not CP-SAT alone?** Wrapping an industrial solver is commodity.
The contribution is a domain-specialized engine that *proves the same
optima* — with the receipts below — plus a standardized interface that
lets the two cross-check each other live.

**Why not pure Python?** We measured it: the Python search reaches
CP-SAT's penalty at department/university scale but hits its 5 s budget
**unproven** (`feasible`, not `optimal`). Language was not the goal —
proof was. The hot loop (branch-and-bound) moved to C++; everything
else (domains, penalties, validation, output) stays in the shared
Python layer, which is what makes the comparison fair.

**Why not Julia?** JIT warm-up and the deployment tax (Docker, Modal,
CI all gain a second runtime) buy nothing at 8–41 sections; C++ compiles
with the `g++` already present in every build image we use.

## Measured head-to-head (`backend/scripts/benchmark.py`, dev laptop)

| Scenario | CP-SAT | Ours (native C++) | Ours (Python ref) |
|---|---|---|---|
| Story seed (8 sections) | optimal · −6 · 76 ms | **optimal · −6 · 6 ms** | optimal · −6 · 57 ms |
| Department (25 sections) | optimal · −40 · 162 ms | **optimal · −40 · 35 ms** | feasible · −40 · 30,003 ms |
| University (41 sections) | optimal · −40 · 143 ms | **optimal · −40 · 36 ms** | feasible · −40 · 30,025 ms |
| Northgate default (271 sections, 148 instructors, 110 cohorts, 35 PhD students) | optimal · −40 · 8,070 ms | **optimal · −40 · 2,402 ms** | not benchmarked |
| Full University — stress (361 sections, 198 instructors, 100 cohorts, ~12,000 students) | unknown (60 s budget) · 63.4 s | **optimal · −40 · 5,915 ms** | unknown (budget) |

Same proven objective at every demo scale; the native core proves it
faster than CP-SAT on this problem class (faster on every row above).
At the full-university stress scale the comparison changes
kind: CP-SAT (single worker, 60 s budget) finds no feasible timetable
and reports `unknown` — a timeout is never dressed up as a proven
infeasibility, in any engine — while the native core still proves the
optimum, independently verified from its placements
(`test_full_university_stress_scale`). CP-SAT model construction was
also re-indexed (assignment vars grouped by section/instructor/room
cell instead of rescanned per constraint family), which roughly halved
CP-SAT's wall time on the demo scales. Placement agreement with
CP-SAT is low (37% / 12% / 2%) — expected: these instances have many
tied optima and the engines break ties differently. Agreement is *not*
the equivalence claim; the proven objective + independent hard-constraint
verification is.

## What makes the proof finish (the interesting part)

Plain branch-and-bound (the Python reference) cannot close the last
penalty points: one section (`sec-math201`) sits +6 above its static
lower bound because its preferred option needs Prof. Patel in a slot
another section holds. The native core adds three domain-aware proof
techniques on top of greedy descent + single/ejection hill-climbing:

1. **Live admissible bound** — at every node, current penalty plus the
   cheapest *currently viable* option per unassigned section.
2. **Pairwise-conflict bound** — for contending section pairs whose
   cheapest viable options clash (same instructor/room slot, or a
   demanded cohort pair), at least one side must pay its deviation
   cost; summed over a disjoint matching of such pairs, this stays
   admissible and lifts the bound by exactly the contested points.
3. **Unit propagation** — sections with one viable option are forced
   immediately; zero viable options is an instant dead end.

Variable ordering is MRV with the bound computed in the same pass.
Deterministic: single thread, sorted domains, no randomness — two runs
return identical placements (tested).

## Equivalence evidence (all in `backend/tests/test_native_solver.py`)

- Proven parity: `optimal` status and identical objective vs CP-SAT at
  seed, department, and university scale.
- Independent verification: hard constraints checked from placements
  alone (qualification, room type/capacity/equipment, blackouts, load /
  prep caps, no instructor/room/cohort overlap) — the shared checker in
  `backend/tests/test_home_solver.py`.
- Same minimal conflict core on the Diaz overload: `[0, 1, 2]`, via
  deletion minimization with the native solver as its own oracle (the
  same contract CP-SAT's assumption literals provide).
- Determinism and request-op semantics (unavailability ops honored).

## Robustness and randomized evidence

Two solver defects were found and fixed during the realism audit:

- the native core tracked course prep sets in a 64-bit mask, so a catalog with
  more than 64 courses aliased course ids (the default institution has 271);
  it now uses exact per-instructor course counts;
- the native and greedy paths ran without the spectral warm-start hints CP-SAT
  uses. Wiring the same hints into the shared preparation took the 271-section
  default institution from "unknown after 120 s" to "optimal in 2.4 s".

`backend/scripts/solver_audit.py` runs all engines on the deterministic tiers
and seeded randomized realistic variants, verifies every timetable
independently, and records status/objective/time/C39/room utilization/faculty
student-load/agreement in `docs/solver_performance.md`. Greedy runs are
reported as `feasible` unless their incumbent meets the admissible bound; a
timeout is `unknown`, never `infeasible`.

## Honest limits

- **Both engines race under the same deterministic contract: one search
  worker, sorted domains, identical time budgets.** CP-SAT can be run as a
  multi-worker portfolio, which is faster on some instances but returns
  different tied optima run-to-run; this system requires bit-reproducible
  timetables for its audit trail, so the comparison holds both engines to
  the single-worker deterministic contract (the native core is likewise
  single-threaded). Granting CP-SAT more workers trades away the
  reproducibility the product is built on — it does not change the scoped
  claim, which is about proven optima under that contract.
- CP-SAT is a general solver; ours is specialized. On adversarial
  instances CP-SAT's clause learning will win, and the UI says so —
  the compare view ranks engines from outputs only. The stress row
  above is the honest boundary in the other direction: a loose,
  wide, real-world-shaped instance where domain specialization
  completes and the general search does not (inside its budget).
- Term Change coverage probes (`propose_candidates`) still run on CP-SAT;
  the engines share the contract, so this is a configuration choice,
  not a limitation of the native core.
- If the native binary is not built (e.g. a platform without `g++`),
  `ours` transparently falls back to the Python reference search and
  still returns CP-SAT's penalty at scale — labeled `feasible` when it
  cannot prove optimality inside the budget. No silent claims.

## Reproduce

```bash
bash backend/scripts/build_native.sh          # g++ -O3, ~2 s
cd backend && .venv/bin/python scripts/benchmark.py
.venv/bin/python -m pytest -q                 # incl. native parity tests
```
