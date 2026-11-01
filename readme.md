[![CI](https://github.com/prohle/schedulesolve-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/prohle/schedulesolve-ai/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Python 3.12](https://img.shields.io/badge/Python-3.12-blue.svg)](./backend)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-black.svg)](./frontend)
[![Tests](https://img.shields.io/badge/tests-78%20passing-brightgreen.svg)](#run-it)
[![Meta models](https://img.shields.io/badge/Meta%20models-Muse%20Spark%20%C2%B7%20Voice%20%C2%B7%20Spark%20Open-0668E1)](#meta-ai-tooling-at-runtime)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED.svg)](./docker-compose.yml)

# ScheduleSolve AI — Agentic Constraint Solver & Timetable Infrastructure

> **Category:** Autonomous Agents & Workflows · Education & Knowledge Systems
> **Domain:** Combinatorial optimization, operations research, constraint programming (CP-SAT), spectral graph analysis
> **Stack:** Meta Model API (Muse Spark) · **dual solver engines — OR-Tools CP-SAT and an AI-built native C++ rival solver that proves the same optima faster on this problem class (evidence: [docs/solver_evidence.md](./docs/solver_evidence.md))** · FastAPI · Next.js · Postgres 18 · multi-user (coordinator / instructor / student logins)

**Every term, every department rediscovers that the course timetable is an NP-hard constraint problem managed with email and spreadsheets.**

A department's instructors — twenty-six in the loadable department-scale scenario, six in the demo seed — with hard constraints ("never Tuesdays, committee duty"), soft preferences ("mornings, please"), teaching-load and prep caps. Four cohorts at different points of the same degree roadmap — the CS 2025 cohort needs CS 201 *this term* or forty-five students slip a semester. Elective pools with estimated take-up, enrollment that surges after registration closes. A fixed inventory of rooms — each course needing the right equipment and size — across a campus you can't cross in ten minutes between classes. And one coordinator whose calendar bleeds a week, every term, translating all of it into a spreadsheet that is wrong the moment reality changes.

**ScheduleSolve AI automates that reconciliation.** Messy files go in — in any format, from any office — Muse Spark autocleans them into one model of the entire institution, natural language adds constraints, and a deterministic solver engine guarantees the output: a provably feasible, recommended timetable for the whole college/university, a minimal-conflict explanation when a request can't hold, and when reality breaks the term mid-flight (an instructor will no longer teach this term, a hall closes), coverage is determined by solver feasibility probes over every qualified instructor, not by model suggestion.

> The LLM never touches the schedule. It only proposes constraints, and every
> constraint — and every coverage proposal — is verified by a solver.

Built for the **Meta Global AI Developer Hackathon** — *Build for Your World* track. This is the problem we know firsthand.

**360° around one proven timetable.** The coordinator builds the term for the whole institution; faculty shape it with their availability, preferences, and verified change requests; and every student is advised from it individually — study record and desired degree in, a mandatory/optional plan that fits their life out, re-verified before it is shown. Three sides of campus, one solver-proven schedule underneath (what that 360° does *not* cover is stated in [docs/limitations.md](./docs/limitations.md)).

> **▶ Live demo (no account, no API key needed): https://prohle--schedulesolve-ai-ui-web.us-east.modal.run** — the full Express flow (Import → Intake → Build → Review → Term Change) plus the Full advanced workspace, proxied to the backend API at https://prohle--schedulesolve-ai-api.us-east.modal.run (`/docs`, `/status`, `/engines`). Both are scale-to-zero on Modal, so the first request may take a few seconds. The hosted demo persists to a single-tenant SQLite volume; the repo's Docker stack runs Postgres 18. Judges can also run everything locally in 2 minutes with `docker compose up` — see [Run it](#run-it).
>
> **▶ Demo video (2:51, live Puppeteer screencast of the running app — not screenshots): https://github.com/prohle/schedulesolve-ai/releases/download/demo-video/final.mp4** — re-recorded Nov 1 on the current landing + ScheduleSolve UI: landing → one-click coordinator login → any-format import autoclean → Patel intake → **dual-engine compare with Rank 1 / Rank 2 ranked from outputs** → university-scale publish → instructor change request approved and re-published → Chen term change with solver-verified coverage + agent trace → growth what-if re-solve. Script and recording pipeline: [docs/demo_script.md](./docs/demo_script.md).

**Meta models at runtime:** Muse Spark `muse-spark-1.3-contributor` (ingest, constraint parse, explanation, tightener, student plan) · Muse Voice Transcribe `muse-voice-transcribe-1.0` (draft-only voice notes) · verified **Muse Spark Open** `meta-models/muse-spark-open-1026` path on Baseten (18/18 live calls) — full table and captured runs in [Meta AI tooling at runtime](#meta-ai-tooling-at-runtime). The LLM proposes; the solver proves.

![Express · Build: visual timetable grid](docs/screenshot-build.png)

![Express · Term Change: before/after with CP-SAT-verified reassignment](docs/screenshot-term-change.png)

![Student · Suggest my schedule: record-based advising with a verified personal plan](docs/screenshot-student.png)

## How it works

```
INGEST     point the tool at messy institutional files in ANY format — a PDF
           catalog, a Word degree map, a CSV of cohorts, an Excel room sheet,
           plain-text emails, or a zip of all of them. A format layer extracts
           the text (PDF/DOCX/XLSX/CSV/JSON/TXT/MD/ZIP); if the files answer
           the six requirements, Muse Spark autocleans them into typed
           entities and the normalizer assembles the Scenario — one model of
           the entire college/university
INTAKE     every faculty member signs in individually before the deadline and
           elects hard unavailability + soft preferences in a per-professor
           grid (the coordinator can also paste free-text intake): constraints
           -> Muse Spark (structured output) -> typed hard/soft constraints
           -> validated -> provenance stored
BUILD      both engines assign every section an instructor, timeslot set,
           and room: qualification, loads, prep caps, room capacity/type,
           equipment, meeting patterns, cohort conflicts, electives, campus
           walk distances, active enrollment, preferences. The AI-built
           rival solver and CP-SAT then race on identical data; the compare
           evaluates both final schedules from outputs alone (proven status,
           then penalty, then speed) and ranks Rank 1 / Rank 2
OPERATE    the coordinator publishes the winning timetable; instructors and
           students sign in to their own role-filtered schedules, and each
           student is advised from their own study record + desired degree:
           mandatory/optional from the fed degree map, a proven personal
           plan that fits their work days — or a named reason it cannot.
           Changes
           arrive two ways: a term change (a typed message -> impact analysis
           -> propose_candidates: every qualified instructor solver-probed
           for zero-ripple feasibility + preference delta, ranked with
           plain-English reasons -> pick -> timetable updates), or an
           instructor's own change request, which the coordinator approves
           only after the same verified loop re-proves and re-publishes it
TIGHTEN    when the solver deadlocks or the four-course guarantee fails:
           spectral radar -> Muse Spark proposes typed repair moves
           (raise_load_cap, add_section, add_qualification, open_elective,
           drop_request) -> CP-SAT verifies each -> only proven moves shown
GROW       plan with proof before spending: enrollment +20%, repurpose a
           hall, build a new lab — each what-if re-solved with utilization
           and guarantee deltas. Add a college, a degree, a course, or an
           adjusted degree map by re-ingesting the changed files and
           re-solving the larger institution
```

When a request set is infeasible, the solver doesn't just fail — every incoming constraint is guarded by a CP-SAT *assumption literal*, so the model returns the **minimal conflicting subset** of the request. Then the two-layer self-heal fires: **Muse Spark translates the proof** (plain-English explanation + ranked resolutions, each dropping one conflicting request), and **CP-SAT re-solves every proposed resolution** before it can be shown — the agent presents only *proven* options, and auto-applies the least disruptive one.

**Every co-pilot run returns an agent trace** — the autonomous loop made visible, step by step with the actor named: `parse (Muse Spark) → validate → solve (CP-SAT) → conflict-core → explain (Muse Spark) → verify each resolution (CP-SAT) → auto-apply the least-disruptive proven fix → audit`. The Term Change flow traces the same way (`parse → impact → probe every candidate → choose → re-solve → audit`). Express renders the trace live; it is also in the API response (`agent_trace`). No step is a model guess: each one either proposes (Muse) or proves (CP-SAT).

**Spectral warm-start runs on every solve**: the section-conflict graph (cohort hard edges + instructor soft edges) yields Laplacian eigenvalues and the Fiedler vector, whose spectral coloring becomes CP-SAT `AddHint` hints. The same graph powers a **deadlock radar** — algebraic connectivity μ₂, Hoffman chromatic lower bound, exact max clique — that names a structural deadlock (a same-pattern clique exceeding the 4-period MWF/TTh band) *before* the solver wastes a solve, and feeds the tightener.

**Four-course guarantee (C39)** audits every placed timetable: can each cohort assemble ≥4 distinct, mutually non-overlapping courses toward graduation? Shortfalls trigger the tightener's `open_elective` moves, which the solver verifies.

Full constraint catalog — offerings & degree roadmaps, course optionality, active enrollment, equipment, cohort progression, instructor hard/soft schedules, rooms & campus walk matrix, with a coverage map of every real-world consideration: [docs/constraint_catalog.md](./docs/constraint_catalog.md)

## What a demo sounds like

| Who says | What happens |
|---|---|
| "Prof. Patel can't teach Mondays — committee duty." | Her sections legally re-home to other instructors and the rest of the board shifts to keep the cohort conflict-free. One sentence, a multi-section ripple, all solver-verified — and **applied to the term**, so the next solve keeps it. |
| "Prof. Chen will no longer teach this term — who should take over her sections?" | Two affected sections. Ranked, CP-SAT-verified coverage proposals — *Okafor (qualified, load 2/3, no preference cost)* over *Nguyen (qualified, +8 preference penalty)* — chosen, re-solved. |
| "Diaz is taking over CS 101, MATH 201 and CS 201 personally." | INFEASIBLE — Diaz's load cap is two sections. Muse Spark's explanation names the binding rule and ranks resolutions ("drop the CS 201 pin — Okafor has capacity to take it"); **every option is re-solved by CP-SAT with its own penalty delta**, the least disruptive one applies. |
| "CS 350 enrollment jumped to 45 after registration ended." | Active enrollment re-triggers every capacity check; the board re-solves and CS 350 lands in the 120-seat hall with zero cohort conflicts. |
| *(coordinator clicks Publish, then signs in as Prof. Chen)* | Chen sees **only her own sections**. Her request "I can't teach Fridays" goes to the coordinator, who approves it — the verified loop re-solves, re-publishes, and her personal grid updates. A student signing in sees only their cohort's courses. |
| "I work Tuesdays and Thursdays. I need CS 201 this term, no 8 AMs." *(a student, in My Schedule → Suggest my schedule)* | Advising starts from the student's own record: mandatory vs optional from the fed degree map, completed courses from their study record (or a cohort progress lookup), desired degree of their choice. Muse Spark parses record + life constraints; a degree-map audit shows mandatory done / ready / co-takeable / locked; an exact selector then recommends — zero overlaps, nothing already completed, nothing on work days — re-verified independently before it is shown. When CS 201's only section is the 8 AM one, the student is told that plainly instead of being handed a plan that slips their degree — and the projected graduation term shows whether the plan keeps them on track or which course pushes it out. If their record disagrees with the cohort lookup, or a must-take course clashes with their availability, both sides are surfaced with a one-click choice of what wins; missing inputs (e.g. a study record) are named too. |
| "What if enrollment grows 20% — or we repurpose the big hall?" | Each growth/repurpose/build-a-lab what-if is re-solved first: utilization and four-course-guarantee deltas with a plain verdict, before capital is committed. Add a college, degree, or course — or adjust a degree map — by re-ingesting the changed files; the institution re-solves as one. |
| *(C39 shortfall fires)* | "CS 2023 cohort can only fit 2 of 4 non-conflicting courses." → the tightener proposes opening already-offered electives; CP-SAT verifies the margin gains against the current board and **rejects** moves that make the enlarged scenario infeasible. Only verified moves are shown. |

## Proof at university scale

The demo story above is one department slice (6 instructors, 8 sections) so every beat fits in three minutes. The same engine — same code path, one click in the Build step (**Department** / **University** scale buttons, or `POST /scenario/department` / `/scenario/university`) — solves a full department cluster (**26 instructors, 25 sections, 12 cohorts, 3 programs**) or the entire university (**38 instructors, 41 sections, 20 cohorts, 5 programs** sharing the same rooms, slots, and campus walk matrix), built deterministically from the seed (`backend/app/data/department.py`). Measured with `backend/scripts/benchmark.py` (single-worker deterministic CP-SAT, dev laptop):

| Scenario | Instructors | Sections | Rooms | Cohorts | Programs | CP-SAT | Ours (native C++) | Ours (Python ref) | C39 guarantee | Room util. | Term Change (Chen leaves the term) |
|---|---:|---:|---:|---:|---:|---|---|---|---|---:|---|
| Story seed (demo) | 6 | 8 | 7 | 4 | 1 | optimal 79 ms · penalty −6 | **optimal 6 ms · penalty −6** | optimal 45 ms · penalty −6 | 2/4 (tightener demo world) | 39% | 2 affected, 3/3 probes feasible |
| Department scale | 26 | 25 | 16 | 12 | 3 | optimal 80 ms · penalty −40 | **optimal 19 ms · penalty −40** | feasible 5 s · penalty −40 (unproven) | 12/12 cohorts ≥ 4 courses | 52% | 2 affected, 3/3 probes feasible, re-solve optimal |
| University scale | 38 | 41 | 16 | 20 | 5 | optimal 153 ms · penalty −40 | **optimal 29 ms · penalty −40** | feasible 5 s · penalty −40 (unproven) | **20/20 cohorts ≥ 4 courses** | 64% | 2 affected, 3/3 probes feasible, re-solve optimal |
| Full University (stress) | 198 | 361 | 61 | 100 | 25 | unknown (10 s budget) | **optimal 3,285 ms · penalty −40** | unknown (budget) | **100/100 cohorts ≥ 4 courses** | 77% | not probed (CP-SAT base solve exceeds budget here) |

## Two engines, one contract: industrial CP-SAT vs an AI-crafted solver

**We used AI to build a second solver, not just to call one.** Alongside Google's engine, ScheduleSolve ships a complete constraint solver designed and written for this problem — and because both live behind one standardized interface (`GET /engines`, `POST /solve` with `engine`, one `SolveResult` shape), you can choose either per solve, or race them head-to-head on the *exact* same messy constraints, preferences, and room capacities. Two independent implementations therefore cross-check each other on identical inputs, live.

**Second engine, built during the hackathon window.** The initial implementation used CP-SAT only. A domain-specialized engine was then developed against it: first a Python reference search, which matched CP-SAT's objective at department and university scale but exceeded its 5 s budget without an optimality proof; then a native C++17 search core (minimum-remaining-values ordering, unit propagation, live and pairwise-conflict admissible bounds). Measured on identical inputs, it returns the same proven objective at every demo scale with lower proof time (university: 29 ms vs 153 ms) — and at the full-university stress scale it is the only engine that completes the instance at all (optimal in ~3.3 s; CP-SAT reports `unknown` inside its 10 s budget). The Build step ranks both engines from outputs alone (Rank 1 / Rank 2 + verdict). CP-SAT remains the general-purpose solver and still powers the term change feasibility probes; the scope and limits of the comparison are documented in [docs/solver_evidence.md](./docs/solver_evidence.md).

- **OR-Tools CP-SAT** (`cpsat`): industrial brute force done right — C++, clause learning, cuts through the search space and returns a *mathematically proven* optimum in fractions of a second. Assumption literals give minimal conflict cores.
- **ScheduleSolve native solver** (`ours`, `backend/native/schedulesolve_solver.cpp` + `backend/app/solver/native_solver.py`): an AI-authored C++17 search core built for this problem — MRV over live domains, unit propagation, branch-and-bound with a live admissible bound plus a *pairwise-conflict bound* (contending sections whose cheapest options clash force a deviation cost), single/ejection hill-climbing, and deletion-minimization conflict cores with itself as oracle. Domains and penalties come from the identical preparation code CP-SAT uses, so the engines differ only in search. A Python reference implementation of the same algorithm (`backend/app/solver/home_solver.py`) is the readable specification and the fallback when the binary is unbuilt. No OR-Tools anywhere in either path.
- **Greedy descent** (`greedy`): the first descent only — plug-and-play proof that a new engine is one registry entry (`backend/app/solver/engine.py`); it shows exactly what the optimization phases buy.

**Head-to-head (measured, `scripts/benchmark.py`):** ours *proves the same optimum as CP-SAT at every demo scale, faster on every row* (university: optimal −40 in 29 ms vs 153 ms), and at full-university stress scale (361 sections) it alone proves the optimum (3,285 ms) while CP-SAT exceeds its budget (`unknown`). The pure-Python reference reaches the same penalty but cannot prove optimality inside its 5 s budget at scale — that measured gap is exactly why the search core is native C++, and why the claim is scoped to this problem class (CP-SAT remains the better general solver; full analysis in [docs/solver_evidence.md](./docs/solver_evidence.md)). **Compare engines** (Build step, or `POST /solve/compare`) diffs status, runtime, penalty delta, placement-agreement %, and both grids with differing sections ringed; the compare ranks engines from outputs only. Tests verify ours independently — hard constraints checked from placements alone, proven objective parity at all scales, the identical conflict core `[0,1,2]` on the Diaz overload, determinism (`backend/tests/test_native_solver.py`, `backend/tests/test_home_solver.py`).

At department scale every cohort still gets its four-course guarantee, every course has ≥2 qualified instructors, and the Chen term change still re-homes exactly CS 301 + CS 310 with zero ripple. Locked in by `backend/tests/test_department.py`. Reproduce: `cd backend && .venv/bin/python scripts/benchmark.py`.

**Capacity showcase (university scale, one click in Build):** 5 degree programs (CS, Mathematics, Data Science, Business, Humanities) · 38 instructors · 41 sections · 20 cohorts · **530 students** on degree roadmaps · 16 rooms / 694 seats / 4 buildings with a walk-time matrix · 20 weekly slots per room — all of it solved as *one* institution sharing the same rooms and hours, not five toy departments side by side. That is the capacity a real registrar's office actually schedules.

**Full-university stress scale (one more click — Full University):** 25 degree programs · 198 instructors · 361 sections · 100 cohorts · **~12,000 students** · 61 rooms across 7 buildings. This is the realistic enterprise volume: at this scale CP-SAT (single worker, 10 s budget) finds no feasible timetable and honestly reports `unknown`, while the AI-authored native solver still proves the optimum in ~3.3 s (independently verified from its placements, C39 guarantee 100/100). The demo path stays at department/university scale, where both engines prove optima and race; the stress tier exists so the scale claim is measured, not asserted.

**Coordinator-time impact:** the manual baseline this replaces is roughly a coordinator-week per term (~30–40 hours of email, spreadsheets, and rework, plus hours per mid-term disruption). ScheduleSolve AI's measured loop is: one Muse parse (~8–25 s live), one CP-SAT solve (~0.15 s at department scale), and — per disruption — a probe-verified coverage decision in seconds. The honest claim is not "AI schedules for you"; it is that a week of constraint-wrangling compresses into an auditable review of solver-proven options.

## What we built vs. what we rent

Honest accounting — the rented parts are named, not hidden:

| Ours (written this hackathon) | Rented (named, not claimed) |
|---|---|
| **Native C++ solver** (522 lines, `backend/native/schedulesolve_solver.cpp`) + Python reference (`home_solver.py`) — MRV search, unit propagation, pairwise-conflict admissible bound; proves CP-SAT's optimum faster on this problem class (and completes the 361-section stress instance CP-SAT cannot) | OR-Tools CP-SAT (Google) — general solver, term change probes |
| CP-SAT timetable model with assumption-literal minimal conflict cores (`scheduling_model.py`, 516 lines) | Muse Spark / Spark Open / Voice Transcribe (Meta) — propose, never decide |
| Spectral engine: Laplacian/Fiedler/Hoffman/exact max-clique → warm-start hints + deadlock radar (`intelligence/spectral.py`) | Next.js, FastAPI, scipy/numpy, Postgres |
| Self-healing loop: minimal core → explanation → **every resolution re-solved before it can be shown** → least-disruptive auto-apply (`services/copilot.py`) | Modal hosting, Baseten inference for the open-weights path |
| Term Change probe-and-rank over every qualified instructor; C39 four-course audit; typed tightener with closed move grammar | |
| Any-format ingestion (PDF/DOCX/XLSX/CSV/JSON/TXT/MD/ZIP → typed scenario) + deterministic completeness check | |
| Multi-user product: role-filtered schedules, verified change requests, Express/Full UI, audit ledger | |

Boundaries we don't cross are listed just as plainly: [docs/limitations.md](./docs/limitations.md). A claim-by-claim audit of what is real, synthetic or illustrative is in [docs/truthfulness.md](./docs/truthfulness.md).

## Meta AI tooling at runtime

**Every model this project calls at runtime is a Meta model**, via the Meta Model API. The deterministic core (the solver engines) is not a model — the LLM proposes, the solver proves. When no API key is present, all model roles degrade to deterministic templates (dev/tests cost zero credits).

**The role of Muse, stated plainly:**
- **Cleanse** — messy institutional files in any format (PDF, Word, Excel, CSV, text, zip) are extracted to text, and Muse Spark autocleans them into typed, solver-ready data for the entire institution.
- **Flag gaps** — the extraction feeds a deterministic completeness check over the six required inputs, so the coordinator is told exactly which requirement is missing before any solve is attempted.
- **Identify the fit** — who is qualified for what, which room fits which course (capacity, type, equipment), which cover fits an orphaned section: Muse proposes candidates, the solver's qualification/capacity model proves the fit.
- **Translate people** — free-text constraints ("can't teach Mondays", "Chen will no longer teach this term") become typed, validated operations a solver can reason about.
- **Evaluate the finals** — when both engines return optimal schedules, the platform ranks them from outputs alone (proven status → preference penalty → speed) as Rank 1 and Rank 2; Muse explains the verdict and breaks human ties among *verified* options — never inside the math.
- **Explain and repair** — when a solver proves a request impossible, Muse translates the proof into plain English and ranks the *proven* fixes by human disruption; typed tightening moves from a closed grammar, each re-solved before it can be shown.
- **Advise a student from their record** — advising is individual: mandatory vs optional comes from the degree map the institution fed in; completed courses come from the student's own study record (pasted, or named as passed) or, only if none is given, a progress lookup from their cohort's roadmap position. Muse parses record + life ("I work Tue/Thu, I need CS 201, no 8 AMs") into typed constraints; a degree-map audit reports mandatory done / ready / co-takeable / still locked; an exact selector then recommends (mandatory-ready first, optional picks to fill, gating courses co-enrolled where the map allows), re-verified independently before it is shown. If a must-take course cannot fit, the answer says exactly that instead of quietly delaying their degree. The result also carries a **projected graduation term** derived from degree-map depth, completed courses, locked prerequisites and the verified plan — "On track for Spring 2029" or "CS 401 pushes graduation +1 term". Contradictions are never resolved silently: a record that disagrees with the cohort lookup, a must-take course that only meets inside an unavailable block, or "I need CS 201" when CS 201 is already completed each come back as a named conflict with both options, and the student chooses which wins. The response also lists the **input that is missing** (e.g. an individual study record) so the projection can be made exact.
- **Keep distribution explicit** — the objectives Muse's constraints feed are measurable per solve: balanced faculty loads and prep caps (fair distribution), every cohort's ≥4-course guarantee (degree progress), preference satisfaction, and room utilization per building.
- **Never decide** — no schedule, coverage, or repair stands because Muse said so. Every one is proven by an engine first.

| # | Runtime call | Model | Code | When it fires |
|---|---|---|---|---|
| 1 | Data ingestion → autoclean free-form institutional data into the structured scenario (structured output) | Muse Spark `muse-spark-1.3-contributor` | `backend/app/ingestion/parser.py` | you paste a catalog / degree maps / cohorts / faculty / rooms |
| 2 | Constraint parsing → typed operations (structured output) | Muse Spark `muse-spark-1.3-contributor` | `backend/app/parsing/parser.py` | every intake submission, chair request, term change message |
| 3 | Self-healing explanation → conflict explanation + ranked resolutions (structured output) | Muse Spark `muse-spark-1.3-contributor` | `backend/app/agent/explainer.py` | whenever a solver proves a request infeasible |
| 4 | Intelligence tightening → typed repair moves (structured output) | Muse Spark `muse-spark-1.3-contributor` | `backend/app/intelligence/tightener.py` | spectral deadlock warning, C39 margin shortfall, or base infeasibility |
| 5 | Student schedule suggestion → typed life constraints (structured output) | Muse Spark `muse-spark-1.3-contributor` | `backend/app/parsing/student.py` | a student says "I work Tue/Thu, I need CS 201, no 8 AMs" and gets a proven personal plan |
| 6 | Voice note → reviewable text draft (never an unattended change) | Muse Voice Transcribe `muse-voice-transcribe-1.0` | `backend/app/services/voice.py` (`POST /term-change/audio`) | a coordinator dictates a note; a signed-in human reviews and submits it as typed text — a recording can't prove who is speaking, so voice changes nothing by itself |

**Set your key** (the repo ships `.env.example` — copy it to `.env` and fill in `MODEL_API_KEY`; `.env` is gitignored):

```bash
cp .env.example .env        # then paste your key from https://dev.meta.ai/dashboard
docker compose up --build   # live Muse Spark
```

**Sample outputs / provenance:** `backend/muse-verification.json` is a live captured run of the structured roles against the seed (ingestion + parse + explanation + tighten), all `muse-spark-1.3-contributor`, with real structured outputs and latencies (3–42 s per call across the contributor and open-weights captures). The parse battery includes a speaker context for identity-dependent messages. `backend/muse-verification-student.json` captures the fifth role live: a student-plan parse from a stated record (work days + completed courses, degree-map audit, verified plan end-to-end). `backend/muse-verification-voice.json` captures Muse Voice Transcribe producing a review draft; spelled-out academic titles from speech recognition are normalized deterministically before parsing.

*All four structured roles run on the contributor model because the data is synthetic; a real institution would use standard mode (`muse-spark-1.3`) so no staff data ever trains Meta's models. Dev-time coding tools are unrestricted by the hackathon and touch nothing at runtime.*

**Open-weights path — verified live:** the client is endpoint-agnostic (`MUSE_BASE_URL` + `MUSE_MODEL`), and all four structured roles are verified running on **Muse Spark Open** (`meta-models/muse-spark-open-1026`) served by Baseten: `backend/muse-verification-open.json` captures 18/18 live calls (12 parse, 3 explanation, 2 tighten, 1 ingestion) with real structured outputs and latencies. To run the whole app on open weights, set `MUSE_BASE_URL=https://inference.baseten.co/v1`, `MUSE_MODEL=meta-models/muse-spark-open-1026`, and the Baseten key as `MODEL_API_KEY` — no code changes.

## Intelligence layer (scipy sparse + spectral + AI)

| Endpoint | What it returns |
|---|---|
| `GET /intelligence/matrices` | 8 labeled sparse matrices (scipy CSR): classroom (rooms×courses, seat headroom), fulfilment (cohorts×courses, depth-before-completion), demand, cohort_sections, faculty_availability (instructors×20 slots), faculty_blackouts, faculty_preferences, qualification. Departmental capacity heatmap + dead zones from stacking the faculty tensor. |
| `GET /intelligence/spectral` | Conflict-graph spectrum: Laplacian eigenvalues, algebraic connectivity μ₂, Hoffman chromatic lower bound, exact max clique (Bron-Kerbosch), Fiedler vector + 2-way partition, spectral ordering → **slot hints injected into CP-SAT as AddHint warm-start**. Deadlock warnings (structural infeasibility, clique > band capacity). |
| `GET /intelligence/margins` | C39 four-course guarantee audit against the placed timetable: per-cohort max non-overlapping course count, example track, offered pool, risk flag. |
| `POST /intelligence/tighten` | Muse proposes typed moves from closed grammar; CP-SAT re-solves each mutated scenario. Only *verified* moves returned, with their penalty deltas and new margins. |
| `GET /history` | The provenance ledger: every intake submission and change event (`parse` / `apply` / `drop` / `term_change` / `tighten`), surfaced in the **Audit Trail** tab. |

### Screens

**Audit trail** — every submission and change event, newest first, with the live `muse-spark` badge.

![Full · Audit trail](docs/screenshot-audit.png)

## Stack

- **Backend:** Python / FastAPI, OR-Tools CP-SAT (assumption literals for minimal-conflict explanation, feasibility probes for coverage proposals, `AddHint` for spectral warm-start) **plus an AI-authored native C++ rival solver** (`backend/native/schedulesolve_solver.cpp`, Python reference in `backend/app/solver/home_solver.py`), selectable per solve and comparable side by side
- **Multi-user:** SQLAlchemy accounts with PBKDF2 password hashes + hashed bearer sessions; coordinator / instructor / student roles; published schedules and instructor change requests in the same Postgres store
- **Frontend:** Next.js
- **Intelligence:** `scipy.sparse` CSR matrices, `numpy`/`scipy` spectral graph (Laplacian, Fiedler, Hoffman bound, exact max clique)
- **Inference:** Meta Model API (OpenAI-compatible, `beta.chat.completions.parse` structured output) — deterministic mock parser included so dev/tests burn zero credits
- **Persistence:** SQLAlchemy over **Postgres 18** in Docker (required — no SQLite mode). Durable institution model, pre-term intake, constraint provenance and the self-healing audit trail (`/history`). Compose uses the project-scoped volume `schedulesolve_pgdata`; on native Linux you can switch it to the in-repo `.data/postgres` bind mount (WSL/Windows drvfs cannot satisfy Postgres's 0700 data-directory check).
- **Deploy:** `docker compose up` (db + backend + frontend) or `./start.sh` (boots the Compose database, then the servers); public demo live on Modal (UI + backend, both scale-to-zero) with a managed Postgres 18 URL.

## Run it

**Judges — try it in 2 minutes, no account, no API key:**

```bash
git clone https://github.com/prohle/schedulesolve-ai && cd schedulesolve-ai
docker compose up --build
# open http://localhost:3000 — landing → Sign In (one-tap demo) → Import → Intake → Build → Review → Term Change
```

Without a key the model roles degrade to a deterministic mock parser, so every beat (parse → solve → self-heal → term-change reassignment → department scale) is clickable offline at zero cost. Add `MODEL_API_KEY` (see below) and the same clicks run live Muse Spark with on-screen model + latency badges. Submission details, track, and bonus-prize flags: [docs/submission.md](./docs/submission.md).

**University setup (coordinator, before the term):** the **University** tab is the institution's durable model — **Facility · Map · People · Degree Map · Course Catalog · Student bodies · Holidays · Number of weeks · Campus-wide constraints · University Calendar · Settings · Save schedule options**. Faculty enter hard constraints and soft preferences against a real deadline; the coordinator watches submissions, accepts the set, then reviews or edits every campus/building/room/hall, load cap, holiday, degree map and course. The shipped mock institution is full: 9 campus quads, 14 buildings, 62 rooms, 118 faculty, 201 courses/sections, 25 majors + 8 minors, 100 cohorts, 4 periods/day. It lives in **Postgres 18** (`institution_state`), so the university does not re-upload the same data each term; **Settings → Update institution data** replaces/extend it.

**Multi-user, role-based:** the app opens on a marketing landing page (`/`); **Sign In** takes you to `/login-register`, and the signed-in workspace lives at `/dashboard`. One-click demo accounts (password `demo1234`, seeded from the scenario itself — no signup needed): `coordinator@schedulesolve.demo` runs the term (Express, publish, approves changes); `chen@schedulesolve.demo` (any `<instructor-id>@…`) sees **only their own sections** in **Schedule**; `cs2025@schedulesolve.demo` (any `<cohort-id>@…`) sees **only their cohort's courses**. The coordinator publishes the solved timetable (**Publish**); instructors' grids update only when an approved change is re-proven by the solver and re-published — an infeasible request comes back rejected with the solver-backed explanation. You can also register your own account and link it to any instructor/cohort.

**Per-professor intake (every professor, not just the coordinator):** every faculty member signs in individually before the deadline and elects their own constraints. In **Schedule**, each instructor gets an availability grid — tap any day/period cell as **Off** (hard: never scheduled), **Avoid** or **Prefer** (soft: the solver pays to violate it) — plus **staff-load steppers** (sections they can teach, max distinct courses) and an optional free-text note. While the intake window is open, those hard/soft picks go straight to `/term/window/submit` for that signed-in professor (with the deadline and days-left on the panel); after it closes they become a coordinator-reviewed change request. Their current published load ("1/2 sections") sits on the same panel. Submissions enter the coordinator's queue next to free-text requests, tagged **picked** with every picked constraint spelled out and the requester's load vs cap. Applying verifies the professor's *exact* picks with the solver — feasible means applied and re-published; infeasible means rejected with the solver's explanation. Nothing is re-parsed and nothing is silently dropped. A professor can only ever constrain themselves.

**Off-time & holidays, three levels:** personal off-time is the grid's **Off** cells (hard unavailability); soft time-off is **Avoid**; campus-wide holidays/closures are the coordinator's **Term closures** card (a weekday, optionally one period — "Thu 11:00 Convocation") which *no engine* may schedule into, honored identically by CP-SAT, the native solver, and greedy (parity-tested). Closures can also be spoken: "No classes on Friday — it's a holiday" parses to the same operation. The **University Calendar** adds real dates: dated holidays and day swaps ("Friday follows Tuesday") are mapped onto the solver's weekly pattern, with a per-section meeting audit that flags any holiday not made up by a swap (see [docs/limitations.md](./docs/limitations.md)).

**Hosted demo (live now):** UI at **https://prohle--schedulesolve-ai-ui-web.us-east.modal.run** and backend at https://prohle--schedulesolve-ai-api.us-east.modal.run (`/status`, `/docs`, `/engines`; both scale-to-zero on Modal, warm them with one request). Deploy your own from [docs/deploy_modal.md](./docs/deploy_modal.md). The local one-command path is below.

**For judges — verify any claim in under 5 minutes (live demo, one-tap Coordinator login):**
1. **Any-format autoclean** — Express → Import: the six sample files are preloaded as pasted text; or drop any registrar file and watch the 6/6 completeness check.
2. **One sentence, proven ripple** — Intake: "Prof. Patel can't teach Mondays" → typed ops, agent trace, applied to the term.
3. **Two engines, ranked from outputs** — Build → Solve → **Compare engines**: Rank 1 / Rank 2 from status → penalty → speed alone.
4. **Scale** — Build → **University**: 38 instructors, 41 sections, 20 cohorts solved as one institution; KPI strip shows the proof time.
5. **Term Change** — Term Change → Apply Term Change: ranked zero-ripple reassignment, only CS 301 + CS 310 move in the After grid.
6. **The advanced workspace** — Full → Radar (spectral health), Planning (20% growth what-if, re-solved first), Audit (every step above, with `muse-spark` provenance).
7. **A student's plan, proven** — sign in as `cs2025@schedulesolve.demo` → Schedule → *Suggest my schedule*: pick your degree, paste a study record (or let it look up your cohort's progress), then "I work Tuesdays and Thursdays. I need CS 201 this term." → a personal plan audited against your record (mandatory done/ready/locked), re-verified before it is shown, with a **projected graduation term** — on track, or the course that pushes it out (add "no 8:00 classes" and it will honestly refuse CS 201's only section instead of slipping the degree).
Nothing here needs an API key or an account beyond the one-tap demo logins.

**Full stack (one command):**

```bash
docker compose up --build
# frontend http://localhost:3000 · backend http://localhost:8000/docs
# database postgres:18 (project-scoped volume schedulesolve_pgdata)
# taken ports?  BACKEND_PORT=8011 FRONTEND_PORT=3011 docker compose up --build
# live Muse?    MODEL_API_KEY=... docker compose up --build
```

**Host dev (Docker database required):**

```bash
./start.sh        # starts the Compose Postgres 18, then backend + frontend
```

**Backend only (Postgres 18 required):**

```bash
docker compose up -d db
cd backend
python -m venv .venv && .venv/bin/pip install -r requirements.txt
export DATABASE_URL=postgresql://schedulesolve:schedulesolve@localhost:5433/schedulesolve
.venv/bin/python demo.py            # full pipeline, mock parser, zero credits
.venv/bin/uvicorn app.main:app      # API at http://localhost:8000/docs
```

Set `MODEL_API_KEY` (from the [Meta Model API dashboard](https://dev.meta.ai)) to switch parsing from mock to live Muse Spark.

**Tests:**

```bash
cd backend
.venv/bin/pip install -r requirements.txt -r requirements-dev.txt
.venv/bin/python -m pytest -q
```

The suite covers solve determinism, hard-constraint satisfaction, the
minimal-conflict core, durable applied state (`/apply` then `/solve`), term change
coverage, the spectral graph, and the API contract. GitHub Actions runs the
backend suite and a production frontend build on every push.

## What was built during the hackathon

Everything in this repository is new work from the Oct 27 – Nov 4 build window;
the commit history is the build log. The main pieces:

| Area | What | Where |
|---|---|---|
| Solver | CP-SAT timetable model, assumption-literal conflict cores, feasibility probes, durable pins | `backend/app/solver/` |
| Agent | Muse Spark parse → validate → solve → explain → **CP-SAT-verified** resolutions → apply | `backend/app/parsing/`, `backend/app/agent/`, `backend/app/services/` |
| Intelligence | Sparse matrices, Laplacian/Fiedler/Hoffman/max-clique radar, C39 audit, AI tightener | `backend/app/intelligence/` |
| Ingestion | Free-form institutional data → Muse extraction → deterministic normalizer → Scenario | `backend/app/ingestion/` |
| Scale | Department-cluster scenario (26 instructors / 25 sections / 12 cohorts) generated deterministically from the seed, one-click load, measured benchmark | `backend/app/data/department.py`, `backend/scripts/benchmark.py` |
| Agent trace | Every co-pilot/term-change response carries the step-by-step loop (actor per step); Express renders it live | `agent_trace` in `backend/app/services/copilot.py`, `term_change.py` |
| UI | Express guided flow, visual timetable grid + before/after diff, Full advanced view, audit trail | `frontend/src/` |
| Ops | Docker Compose (Postgres + API + UI), one-command local runner, provenance ledger | `docker-compose.yml`, `start.sh`, `backend/app/db.py` |

## Status

Built during the hackathon (Oct 27 – Nov 4, 2026) — commit history is the build log. Internal working notes live in local files; the constraint catalog is the source of truth for the model, the parsing vocabulary, and the roadmap.

## Team

Solo entrant — **Huong Le**.

## License

MIT — see [LICENSE](./LICENSE).