[![CI](https://github.com/prohle/schedulesolve-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/prohle/schedulesolve-ai/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Python 3.12](https://img.shields.io/badge/Python-3.12-blue.svg)](./backend)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-black.svg)](./frontend)
[![Tests](https://img.shields.io/badge/tests-100%20passing-brightgreen.svg)](#run-it)
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

## One student, one university — why this exists

**Sarah.** Call her Sarah: a BSc Computer Science student in the CS 2025 cohort, working Tuesdays and Thursdays, who needs CS 201 this term. In the seed degree map that is not a preference — it is the gate. CS 101 (term 1) unlocks CS 201 and MATH 201 (term 3); those unlock CS 301 (term 5); the chain ends at CS 310 / CS 401 (term 7). Miss the one section of CS 201 that fits her life — in the seed it meets only at 8:00 — and nothing downstream moves with her. The capstone does not collide by accident; it collides a year later, when the locked chain reaches it. One colliding course, one extra semester of tuition, graduation pushed a full year — not because Sarah chose badly, but because nobody could prove, at registration time, what that one section would cost her.

ScheduleSolve AI answers Sarah *before* she registers, with a number, not a warning label (worked, tested examples in [Projected graduation term](#projected-graduation-term--sarahs-number-computed-not-guessed) below):

- with a plan that fits her Tue/Thu job: **"On track for Spring 2029"** — her cohort's expected term, `graduation_delay_terms = 0`;
- for a senior whose record is behind the chain and whose must-take course is blocked: **"CS 401 pushes graduation +2 terms — projected Spring 2028"** against an expected Spring 2027, naming the course that causes the delay;
- and when her own study record disagrees with her cohort's progress lookup, the system does not pick a winner for her — it shows both sources and **Sarah chooses what wins**.

**The registrar.** Now step into the registrar's chair. Sarah's problem, multiplied: you are building the operational heartbeat of a whole university — **198 faculty** with load caps, prep caps, committee duties and individual availability; **361 sections**; **100 cohorts** and some **12,000 students** (12,530 enrolled in the stress instance) each navigating a different degree roadmap; and a fixed inventory of rooms across a campus you cannot cross in ten minutes between classes (`walk_limit_min = 10`, enforced by the solver, not by hope). Keep every faculty member inside their load and preferences, keep every cohort able to graduate on time, maximise the rooms you already have — and do it again, provably, the morning a professor leaves, a hall closes, or enrollment surges.

Higher education still tackles this NP-hard combinatorial puzzle with manual spreadsheets and email chains. That is why a single unexpected faculty leave collapses a master schedule, why a classroom relocation is a week of rework, and why a facility what-if ("what if enrollment grows 20%? what if we repurpose the big hall?") is usually answered with a guess. ScheduleSolve AI replaces the guess with a proof, and replaces the week with an auditable review of solver-proven options — for Sarah, for every professor, and for the coordinator who signs the term.

## The grand-prize case, scored on the hackathon's own rubric

This project is entered in the **Indie Developer track** (solo entrant, team-size limit 4) under **Build for Your World**, and is built to be judged — claim by claim — against the Stage Two rubric in the participant guide. No README can award itself a prize; what it can do is make every point below checkable in under five minutes, in the live demo or from this repo. That is the standard this document holds itself to, and it is also the Stage One test: the project reasonably fits the theme and genuinely uses Meta models at runtime.

| Rubric category (weight) | The case for full marks | Proof a judge can check |
|---|---|---|
| **Impact (30%)** | A real, recurring, expensive problem at two scales at once: one student losing a year to one collision, and one coordinator losing a week per term (plus hours per mid-term disruption) to an NP-hard puzzle run on spreadsheets. The fix is quantified, not asserted: coordinator-week → a Muse parse (~8–25 s live) + a solve (~0.15–0.16 s at department scale) + seconds per verified disruption; a student's graduation risk → a named course and an exact term (`+N terms`, named culprit). It runs at the scale a real registrar schedules: 26-instructor department, 38-instructor university, and a 198-instructor / 361-section / 100-cohort / ~12,000-student stress instance with the four-course graduation guarantee at **100/100**. | Scale + timing table in [Proof at university scale](#proof-at-university-scale); reproduce with `backend/scripts/benchmark.py`; C39 audit at `GET /intelligence/margins`; student projection in `backend/tests/test_student_plan.py` (`test_projection_is_on_track_for_an_on_time_cohort`, `test_projection_names_the_course_that_delays_a_senior`) |
| **Use of Meta AI tooling (25%)** | Meta models are the intelligence layer of the whole product, not a chatbot bolted on: **five structured Muse Spark roles** (ingest autoclean, constraint parse, conflict explanation, typed tightening, student-plan parse) plus **Muse Voice Transcribe** as a draft-only input — every one schema-validated, every one visibly badged with model + latency, every one degrading to a labelled deterministic mock with no key. The same four structured roles are **verified live on open-weight Muse Spark Open served by Baseten (18/18 calls)**, and the client is endpoint-agnostic, so the open weights are a configuration swap, not a rewrite. The surprise the rubric asks for: the model was also used to *build a second solver* — an AI-authored native C++ engine that races CP-SAT — and is then never allowed to decide anything. **The LLM proposes; the solver proves.** | Role table + captured runs in [Meta AI tooling at runtime](#meta-ai-tooling-at-runtime); `backend/muse-verification.json`, `backend/muse-verification-student.json`, `backend/muse-verification-voice.json`, `backend/muse-verification-open.json` (12 parse + 3 explanation + 2 tighten + 1 ingestion = 18) |
| **Technical depth & execution (20%)** | Two independent solver engines behind one contract cross-checking each other on identical inputs; CP-SAT assumption-literal **minimal conflict cores**; a native C++ search core (MRV, unit propagation, live + pairwise-conflict admissible bounds) that proves CP-SAT's optimum faster on every measured row of this problem class and is the only engine to complete the 361-section instance; spectral graph intelligence (Laplacian, Fiedler vector, Hoffman bound, exact max clique) feeding warm-start hints and a deadlock radar; a closed-grammar AI tightener whose every move is re-solved before it can be shown; Postgres-backed multi-user roles; **100 tests passing from the repo root (99 backend + 1 root smoke)**, CI on every push. Boundaries are published, not hidden. | [Two engines, one contract](#two-engines-one-contract-industrial-cp-sat-vs-an-ai-crafted-solver); `docs/solver_evidence.md`; `docs/constraint_catalog.md`; `docs/limitations.md`; `docs/truthfulness.md`; `backend/.venv/bin/python -m pytest -q` from the repo root → `100 passed` (99 from `backend/`) |
| **Demo (25%)** | A working product, not a prototype of one: hosted live demo with one-tap demo logins (no account, no API key), a 2:51 live screencast of the running app, and a two-minute local path (`docker compose up`). Every headline beat is clickable in order — any-format import with a 6/6 completeness check, one-sentence Patel intake applied to the term, dual-engine compare ranked Rank 1 / Rank 2 from outputs alone, university-scale publish, instructor change request re-proven and re-published, Chen term change with solver-verified zero-ripple coverage and a live agent trace, Diaz impossible override with conflict core and verified repairs, and a student's verified plan with its projected graduation term. | [For judges — verify any claim in under 5 minutes](#run-it); live demo and video links at the top of this README; `docs/demo_script.md` |

**Bonus prizes — claimed only where the evidence exists:**

- **Best Build on Meta Open Weight Models ($10K) — claim.** All four structured roles run on `meta-models/muse-spark-open-1026` via Baseten, captured live at 18/18 in `backend/muse-verification-open.json`; the swap is env-only (`MUSE_BASE_URL` + `MUSE_MODEL` + key). One honest boundary: the *hosted* Baseten path is remote inference with real, captured latencies — it is not a "0 ms, on-premise" claim, and this README does not make one. What the endpoint-agnostic client proves is that a university *can* self-host the same open weights for on-premise privacy over sensitive student records by configuration alone; the code path judges run is identical either way.
- **Best Agentic Use-Case ($5K) — claim.** An autonomous multi-step agent with a visible trace naming every actor: `parse (Muse Spark) → validate → solve → minimal-conflict-core → explain (Muse Spark) → verify every resolution (CP-SAT) → auto-apply the least-disruptive proven fix → audit`, plus the term-change loop `parse → impact → probe every qualified candidate → choose → re-solve → audit`. Self-correction is bounded and proven: no repair, coverage name, or student plan is shown until a solver has verified it.
- **Most Viral ($20K) / Community Vote ($10K) — eligible, account actions.** Ready X copy and the gallery path are in `docs/submission.md`; posting and voting are human steps after submission, not code claims.
- **Best Creative Build ($5K) — explicitly not claimed.** No Muse Image / Wonder surface exists in this project; flagging it would waste reviewer attention.

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

### The five phases, in full

**Phase 1 — Ingest: messy files in, one institution out, nothing silently resolved.** Point the tool at the files a university already has, in any format — PDF catalogs, Word degree maps, Excel room sheets, CSV cohorts, plain-text emails, or a zip of all of them. A format layer extracts the text (PDF/DOCX/XLSX/CSV/JSON/TXT/MD/ZIP; no OCR — an unreadable file contributes an explicit `[unreadable]` note, never a guess). Muse Spark then autocleans and organises the extracted text into typed entities — courses, degree maps, cohorts/student bodies, faculty with loads and qualifications, rooms, buildings and the campus walk matrix — and a deterministic normalizer assembles one `Scenario`: a single model of the entire institution. Two safeguards run before any solve is attempted. First, a deterministic completeness check over the **six required inputs** (degree catalog, degree maps, student bodies, faculty availability, facilities, campus map) reports *exactly which inputs are missing* — by name — so the coordinator fixes the source instead of discovering the gap inside a failed solve. Second, contradictory information is detected as a first-class object: each disagreement carries the **source of both sides** (which file, which section, which value) and a set of electable winners, and the Import wizard gates on the election — **the user chooses what wins; nothing resolves silently**. The same phase honours faculty voice in plain language: "Professor Patel cannot teach Mondays — committee duty" is parsed by Muse Spark into schema-validated, typed hard/soft operations, validated, stored with provenance, and applied to the term only after the solver proves the resulting world. Proof: `backend/app/ingestion/` (`parser.py`, `check.py` — `REQUIRED_DATA`, `check_completeness`; `conflicts.py` — `detect_conflicts` / `resolve_conflicts`), `backend/app/parsing/parser.py`, `backend/tests/test_ingestion_conflicts.py`.

**Phase 2 — Solve: the LLM never touches the schedule; two engines race, ranked from outputs alone.** The cleaned institution is an NP-hard constraint problem: every section needs an instructor, a timeslot set and a room, subject to qualification, load and prep caps, room capacity/type/equipment, meeting patterns, cohort conflicts, elective demand, active enrollment, campus walk distances and faculty preferences. It is handed to two deterministic engines on *identical* prepared data — Google OR-Tools CP-SAT, and the **ScheduleSolve native solver**, an AI-authored C++17 engine built during the hackathon specifically for this problem class — plus a greedy baseline that shows what the optimisation phases buy. The compare evaluates both finished schedules **from outputs alone** (proven status, then preference penalty, then speed) and ranks them Rank 1 / Rank 2; Muse Spark explains the verdict and may break human ties among *verified* options, but scoring inside the math is algorithmic and reproducible, never a model opinion. The platform also feeds the solver: a spectral warm-start (conflict-graph Laplacian, Fiedler vector → `AddHint`) runs on every solve, and a deadlock radar (algebraic connectivity μ₂, Hoffman chromatic lower bound, exact max clique) names a structural deadlock before a solve is wasted on it. Proof: `backend/native/schedulesolve_solver.cpp`, `backend/app/solver/engine.py` (`rank_results`), `backend/app/intelligence/spectral.py`, `docs/solver_evidence.md`, measured table below.

**Phase 3 — Operate through disruption: reality breaks, the plan re-proves, only what must move moves.** Mid-term, Professor Chen will not teach again this term. The coordinator types one message; the system computes the impact (exactly her sections — CS 301 + CS 310 in the demo world), then runs **zero-ripple coverage probes**: for every qualified instructor, a solver feasibility probe with every unaffected placement pinned. Candidates are ranked by feasibility, current load against cap, and preference delta, each with a plain-English reason and its roster source — and **no name is ever suggested that the solver has not proven can cover**. The coordinator may elect any *proven* candidate per section; an unproven election is refused, and the elected set is re-solved before it stands. The same loop serves the other direction of reality: enrollment surges re-trigger every capacity check, a hall closure or repurpose is a re-solve, and growth what-ifs (enrollment +20%, build a lab, add a college/degree/course, adjust a degree map) are each solved *before* capital is committed, with room-utilisation and four-course-guarantee deltas attached. Proof: `backend/app/services/term_change.py` (`propose_candidates`, pinned re-solve), `backend/tests/test_conflict_election.py` (`test_term_change_coverage_is_electable_and_unproven_elections_refused`).

**Phase 4 — Impossible requests: the solver names the conflict, Muse translates it, humans negotiate over proven repairs.** When conflicting rules make a request mathematically impossible, failing loudly is not enough. Every incoming constraint is guarded by a CP-SAT assumption literal, so infeasibility returns the **minimal conflict core** — the smallest subset of requests that cannot all hold. Muse Spark translates that raw mathematical proof into plain English, names the binding rule, isolates the minimal core, and ranks repair paths by human disruption. Then the discipline that makes this an agent rather than an explainer: **every proposed repair is re-solved by the solver before it can be shown**, the least-disruptive proven fix is auto-applied as the default, any other verified option remains electable by the coordinator, and re-verified elections are enforced server-side. The whole run — parse, validate, solve, isolate, explain, verify, auto-apply, audit — is an autonomous multi-step agent loop whose trace names the actor at every step; no step is a model guess, each either proposes (Muse) or proves (a solver). Proof: `backend/app/services/copilot.py`, `backend/app/agent/explainer.py`, `backend/tests/test_conflict_election.py` (`test_copilot_conflict_names_sources_and_elects_a_winner`).

**Phase 5 — Everyone the term touches, advised from the same proven timetable.** Before the term, **every professor signs in individually before the intake deadline and elects their own hard constraints and soft preferences** — an availability grid (Off = hard, never scheduled; Avoid / Prefer = soft, the solver pays to violate), staff-load steppers (sections they can teach, max distinct preps), and an optional free-text note — while the coordinator watches submissions arrive, accepts the set, and only then does the solver re-prove and publish the term. After publication the views are role-filtered by construction: an instructor sees **only their own sections** (and can file a change request that is re-proven before it can be re-published); a student sees **only their cohort's courses** — and then gets advised individually from them. The student pastes a study record, chooses a degree, and says *"I work Tuesdays and Thursdays. Help me choose classes"*; Muse Spark parses record + life constraints, a degree-map audit reports mandatory done / ready / co-takeable / still locked, an exact selector builds a plan from the placed timetable, an independent check re-verifies it, and the answer carries a **projected graduation term** (next section). Muse Spark remains available to explain the schedule and the impact of a preference or a trade-off to every role, and Muse Voice Transcribe drafts voice notes for human review — draft only, because a recording cannot prove who is speaking. Proof: `backend/app/services/term.py` (intake window, deadline, `accept_window`), `POST /term/window/submit`, `GET /schedule/mine`, `backend/app/services/student_plan.py`, `backend/app/services/voice.py`.

When a request set is infeasible, the solver doesn't just fail — every incoming constraint is guarded by a CP-SAT *assumption literal*, so the model returns the **minimal conflicting subset** of the request. Then the two-layer self-heal fires: **Muse Spark translates the proof** (plain-English explanation + ranked resolutions, each dropping one conflicting request), and **CP-SAT re-solves every proposed resolution** before it can be shown — the agent presents only *proven* options, auto-applies the least disruptive one as the default, and lets the coordinator elect any other verified option instead. Every conflict — imported-data disagreements, solver conflict cores, term-change coverage, student record-vs-lookup clashes — is shown with the **source of each side** (which file, which speaker, which roster/timetable fact) and an explicit election of what wins; nothing resolves silently.

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

## Projected graduation term — Sarah's number, computed not guessed

Every verified student plan carries a **projected graduation term**: the term in which the student can actually finish, derived — in this order — from the degree map, the record, the locks, and the plan itself (`project_graduation` in `backend/app/services/student_plan.py:74`, returned on every `StudentPlanResponse` and rendered in the student panel with its full derivation):

1. **Degree-map depth.** The program's roadmap gives every mandatory course a depth (its term position in the sequence — CS 101 → CS 201/MATH 201 → CS 301 → CS 310/CS 401 in the BSc CS seed). Depth is what makes a prerequisite a *timeline*, not a suggestion.
2. **Completed courses.** What the student has already passed, from the source that wins (their own study record by default; the cohort progress lookup only when no record is given — see the contradiction rules below). Completed mandatory courses leave the remaining set.
3. **Locked prerequisites.** A later mandatory course is gated by every strictly-earlier mandatory course not yet completed. Those gates are the only thing that can force an extra term, so they are the thing the projection simulates.
4. **The verified plan.** The current term is not simulated optimistically — the plan that was just selected and independently re-verified is taken as truth for this term (including deliberate co-enrollment with a gating course where the map allows it).
5. **Future terms at the student's own load.** Remaining mandatory courses are then simulated term by term, in depth order, at the student's target course load (respecting the coordinator's full-time threshold), until the mandatory chain finishes. Term indices map to calendar labels from the cohort's admission year (term 1 = Fall of admission, term 2 = Spring, …), and the expected term comes from the cohort's graduation year.

The output is one of three honest states, never a vague "you might be late":

| State | What the student sees | Tested example (`backend/tests/test_student_plan.py`) |
|---|---|---|
| `on_track` | **"On track for Spring 2029"**, `graduation_delay_terms = 0`, projected = expected | CS 2025, *"I work Tuesdays and Thursdays. I need CS 201 this term"* → verified plan {CS 201, MATH 201, CS 301}, projected **Spring 2029** (`test_projection_is_on_track_for_an_on_time_cohort`) |
| `delayed` | **"CS 401 pushes graduation +2 terms — projected Spring 2028"**, naming the deepest/locked course that forced the extra terms, against expected Spring 2027 | CS 2023 senior with only CS 101 on record, blocked from the 8:00 chain (`test_projection_names_the_course_that_delays_a_senior`) |
| `complete` | **"All mandatory courses complete"**, delay 0 | Record covering the full mandatory chain (`test_projection_reports_complete_when_mandatory_chain_is_done`) |

That is Sarah's story made concrete and product-backed: the same panel that fits her plan around her Tue/Thu job tells her, in the same breath, whether that plan keeps her on track for her expected term or exactly which course pushes it out and by how many terms. It is an estimate from the degree map, record, locks and verified plan — stated as such in `docs/truthfulness.md` — not an official registrar audit, and the panel says which inputs it used.

**Missing input is named, not assumed.** If the student gives no individual study record, the projection falls back to the cohort lookup *and says so*, listing the missing input verbatim ("Your individual study record (completed courses) — the projection is using CS 2025's roadmap position, which may not match your transcript"); supplying the record removes the warning (`test_missing_inputs_name_the_record_the_projection_needs`). A missing degree map is named the same way, and an unknown student/cohort/degree is refused as a named missing input rather than advised around. The institution side has the same discipline: `check_completeness` names which of the six required inputs (degree catalog, degree maps, student bodies, faculty availability, facilities, campus map) are absent before any solve is attempted (`backend/app/ingestion/check.py:14`).

**Contradictions are the student's (or coordinator's) call — never the system's.** Every contradiction surface returns both sources and an explicit election of what wins, with a documented default that is shown, not hidden:

| Where a contradiction appears | Both sides shown | Who chooses the winner | Proof |
|---|---|---|---|
| Imported institutional data (incl. degree maps) | Each side's source file/section and value | Coordinator, in the Import wizard; no silent winner, applying is gated on the election | `detect_conflicts` / `resolve_conflicts`; `test_degree_map_disagreement_is_a_detected_electable_conflict` |
| Solver conflict core (e.g. Diaz's 3-section pin vs a 2-section cap) | The source of each conflicting request | Coordinator: least-disruptive *proven* fix auto-applied as default, any other verified option electable, elections re-verified server-side | `test_copilot_conflict_names_sources_and_elects_a_winner` |
| Term-change coverage (Chen leaves) | Each candidate's roster/qualification source | Coordinator may elect any solver-proven cover per section; an unproven election is refused (`422`) | `test_term_change_coverage_is_electable_and_unproven_elections_refused`, `test_term_change_api_accepts_elected_winners` |
| Student record vs cohort lookup | "Your study record: completed …" vs "Cohort lookup for CS 2025: completed …" | **The student** (`record` default; `lookup` electable, and the progress source then says they chose it) | `test_contradictory_record_and_lookup_let_the_student_choose` |
| Student must-take course vs their availability | Their stated unavailable times vs the published section's actual meeting times/instructor/room | **The student** (`availability` default; `course` electable, included with a plain clash warning) | `test_must_course_vs_availability_lets_the_student_choose` |
| Student must-take course already completed | Their record vs their request in the same message | **The student** (`completed` default; `retake` electable) | `test_must_course_already_completed_lets_the_student_retake` |
| Tightener repair moves | Each move, labelled verified or rejected with its reason | Coordinator; an elected move is **re-verified at apply time** before anything changes | `test_tightener_election_reverifies_before_applying` |

**Faculty elect their own constraints, as individuals, before a deadline.** This is not coordinator data entry. The term opens an intake window with a real deadline (`backend/app/services/term.py`; `POST /term/window/submit` refuses submissions after it). Every professor signs in as themselves and elects: **hard** constraints (grid cells marked Off — never scheduled, honoured identically by CP-SAT, the native solver and greedy) and **soft** preferences (Avoid / Prefer — the solver pays a penalty to violate), plus their own staff-load steppers (sections they can teach, max distinct preps) and an optional free-text note. While the window is open the election goes straight in as that professor's first-class submission, with the deadline and days-left on their panel; after it closes, the same picks become a coordinator-reviewed change request. The coordinator watches submissions, **accepts the set** (`POST /term/window/accept`), the solver re-proves the term, and publication is what makes instructors' and students' role-filtered views update. A professor can only ever constrain themselves; an infeasible election comes back rejected with the solver's explanation, not silently dropped (`backend/tests/test_intake.py`, including the deadline-closes-the-election case).

## Proof at university scale

The demo story above is one department slice (6 instructors, 8 sections) so every beat fits in three minutes. The same engine — same code path, one click in the Build step (**Department** / **University** scale buttons, or `POST /scenario/department` / `/scenario/university`) — solves a full department cluster (**26 instructors, 25 sections, 12 cohorts, 3 programs**) or the entire university (**38 instructors, 41 sections, 20 cohorts, 5 programs** sharing the same rooms, slots, and campus walk matrix), built deterministically from the seed (`backend/app/data/department.py`). Measured with `backend/scripts/benchmark.py` (single-worker deterministic CP-SAT, dev laptop, 2026-11-01; timings vary by machine — rerun the script for local numbers):

| Scenario | Instructors | Sections | Rooms | Cohorts | Programs | CP-SAT | Ours (native C++) | Ours (Python ref) | C39 guarantee | Room util. | Term Change (Chen leaves the term) |
|---|---:|---:|---:|---:|---:|---|---|---|---|---:|---|
| Story seed (demo) | 6 | 8 | 7 | 4 | 1 | optimal 72 ms · penalty −6 | **optimal 12 ms · penalty −6** | optimal 46 ms · penalty −6 | 2/4 (tightener demo world) | 39% | 2 affected, 3/3 probes feasible |
| Department scale | 26 | 25 | 16 | 12 | 3 | optimal 154 ms · penalty −40 | **optimal 19 ms · penalty −40** | feasible 30 s · penalty −40 (unproven) | 12/12 cohorts ≥ 4 courses | 52% | 2 affected, 3/3 probes feasible, re-solve optimal |
| University scale | 38 | 41 | 16 | 20 | 5 | optimal 147 ms · penalty −40 | **optimal 39 ms · penalty −40** | feasible 30 s · penalty −40 (unproven) | **20/20 cohorts ≥ 4 courses** | 65% | 2 affected, 3/3 probes feasible, re-solve optimal |
| Full University (stress) | 198 | 361 | 82 | 100 | 25 | unknown (60 s budget) | **optimal 5,832 ms · penalty −40** | unknown (budget) | **100/100 cohorts ≥ 4 courses** | 70% | not probed (CP-SAT base solve exceeds budget here) |

## Two engines, one contract: industrial CP-SAT vs an AI-crafted solver

**We used AI to build a second solver, not just to call one.** Alongside Google's engine, ScheduleSolve ships a complete constraint solver designed and written for this problem — and because both live behind one standardized interface (`GET /engines`, `POST /solve` with `engine`, one `SolveResult` shape), you can choose either per solve, or race them head-to-head on the *exact* same messy constraints, preferences, and room capacities. Two independent implementations therefore cross-check each other on identical inputs, live.

**Second engine, built during the hackathon window.** The initial implementation used CP-SAT only. A domain-specialized engine was then developed against it: first a Python reference search, which matched CP-SAT's objective at department and university scale but exceeded its 5 s budget without an optimality proof; then a native C++17 search core (minimum-remaining-values ordering, unit propagation, live and pairwise-conflict admissible bounds). Measured on identical inputs, it returns the same proven objective at every demo scale with lower proof time (university: 39 ms vs 147 ms) — and at the full-university stress scale it is the only engine that completes the instance at all (optimal in ~5.8 s; CP-SAT reports `unknown` inside its 60 s budget). The Build step ranks both engines from outputs alone (Rank 1 / Rank 2 + verdict). CP-SAT remains the general-purpose solver and still powers the term change feasibility probes; the scope and limits of the comparison are documented in [docs/solver_evidence.md](./docs/solver_evidence.md).

- **OR-Tools CP-SAT** (`cpsat`): industrial brute force done right — C++, clause learning, cuts through the search space and returns a *mathematically proven* optimum in fractions of a second. Assumption literals give minimal conflict cores.
- **ScheduleSolve native solver** (`ours`, `backend/native/schedulesolve_solver.cpp` + `backend/app/solver/native_solver.py`): an AI-authored C++17 search core built for this problem — MRV over live domains, unit propagation, branch-and-bound with a live admissible bound plus a *pairwise-conflict bound* (contending sections whose cheapest options clash force a deviation cost), single/ejection hill-climbing, and deletion-minimization conflict cores with itself as oracle. Domains and penalties come from the identical preparation code CP-SAT uses, so the engines differ only in search. A Python reference implementation of the same algorithm (`backend/app/solver/home_solver.py`) is the readable specification and the fallback when the binary is unbuilt. No OR-Tools anywhere in either path.
- **Greedy descent** (`greedy`): the first descent only — plug-and-play proof that a new engine is one registry entry (`backend/app/solver/engine.py`); it shows exactly what the optimization phases buy.

**Head-to-head (measured, `scripts/benchmark.py`):** ours *proves the same optimum as CP-SAT at every demo scale, faster on every row* (university: optimal −40 in 39 ms vs 147 ms), and at full-university stress scale (361 sections) it alone proves the optimum (5,832 ms) while CP-SAT exceeds its budget (`unknown`). The pure-Python reference reaches the same penalty but cannot prove optimality inside its 30 s budget at scale — that measured gap is exactly why the search core is native C++, and why the claim is scoped to this problem class (CP-SAT remains the better general solver; full analysis in [docs/solver_evidence.md](./docs/solver_evidence.md)). **Compare engines** (Build step, or `POST /solve/compare`) diffs status, runtime, penalty delta, placement-agreement %, and both grids with differing sections ringed; the compare ranks engines from outputs only. Tests verify ours independently — hard constraints checked from placements alone, proven objective parity at all scales, the identical conflict core `[0,1,2]` on the Diaz overload, determinism (`backend/tests/test_native_solver.py`, `backend/tests/test_home_solver.py`).

At department scale every cohort still gets its four-course guarantee, every course has ≥2 qualified instructors, and the Chen term change still re-homes exactly CS 301 + CS 310 with zero ripple. Locked in by `backend/tests/test_department.py`. Reproduce: `cd backend && .venv/bin/python scripts/benchmark.py`.

**Capacity showcase (university scale, one click in Build):** 5 degree programs (CS, Mathematics, Data Science, Business, Humanities) · 38 instructors · 41 sections · 20 cohorts · **530 students** on degree roadmaps · 16 rooms / 694 seats / 4 buildings with a walk-time matrix · 20 weekly slots per room — all of it solved as *one* institution sharing the same rooms and hours, not five toy departments side by side. That is the capacity a real registrar's office actually schedules.

**Full-university stress scale (one more click — Full University):** 25 degree programs · 198 instructors · 361 sections · 100 cohorts · **~12,000 students** (12,530 enrolled) · 82 rooms across 7 buildings. This is the realistic enterprise volume: at this scale CP-SAT (single worker, 60 s budget) finds no feasible timetable and honestly reports `unknown`, while the AI-authored native solver still proves the optimum in ~5.8 s (independently verified from its placements, C39 guarantee 100/100). The demo path stays at department/university scale, where both engines prove optima and race; the stress tier exists so the scale claim is measured, not asserted.

**Coordinator-time impact:** the manual baseline this replaces is roughly a coordinator-week per term (~30–40 hours of email, spreadsheets, and rework, plus hours per mid-term disruption). ScheduleSolve AI's measured loop is: one Muse parse (~8–25 s live), one CP-SAT solve (~0.15 s at department scale), and — per disruption — a probe-verified coverage decision in seconds. The honest claim is not "AI schedules for you"; it is that a week of constraint-wrangling compresses into an auditable review of solver-proven options.

### The pitch, measured against this repo (and against the rules)

The final pitch was audited line by line against the implementation — the full audit is [docs/pitch_audit.md](./docs/pitch_audit.md) (13 claims, all **True**, two with stated boundaries below). The numbers a judge will hear, re-measured 2026-11-01 with `backend/scripts/benchmark.py` on the dev laptop (single-worker deterministic contract; timings vary by machine, rerun the script for local numbers):

| Pitch figure | Re-measured in this repo | Verdict |
|---|---|---|
| Department: ours 20 ms vs CP-SAT 144 ms | **19 ms vs 154 ms**, same proven penalty −40 | True within run/machine variance |
| University: ours 37 ms vs CP-SAT 159 ms | **39 ms vs 147 ms**, same proven penalty −40 | True within run/machine variance |
| 361 sections: ours alone proves optimal in 6.1 s; CP-SAT unknown | **Optimal 5,832 ms; CP-SAT `unknown` after its 60 s budget (63.3 s wall)** | True |
| 198 faculty · 361 sections · 100 cohorts · ~12,000 students | 198 · 361 · 82 rooms · 100 cohorts · 25 programs · **12,530 students** | True |
| Every cohort can assemble ≥4 non-conflicting courses; 100/100 at full scale | Story 2/4 (the deliberate tightener demo world) · department 12/12 · university 20/20 · **full 100/100** | True, story-seed boundary stated |
| Muse Spark Open on Baseten: 18/18 live structured calls | 12 parse + 3 explanation + 2 tighten + 1 ingestion = **18/18** in `backend/muse-verification-open.json` | True |
| Coordinator-week replaced | ~30–40 h manual baseline (an estimate, labelled as such) → Muse parse ~8–25 s live + solve ~0.15 s + seconds per verified disruption | Directionally evidenced; the manual baseline is the one figure in this README that is an estimate, and it is marked as one wherever it appears |

Two pitch-adjacent claims are deliberately **not** made, because the repo cannot back them: (1) no "0 ms / local / on-premise" latency or deployment claim for the Baseten-hosted open-weights path — it is remote inference with captured real latencies, and the privacy claim is the *self-hostable-by-configuration* property of the endpoint-agnostic client; (2) no claim that Muse scores or ranks the engines — ranking is computed deterministically from solver outputs (status → penalty → speed), and Muse explains the verdict. A claim-by-claim audit of what is real, synthetic, or illustrative is in [docs/truthfulness.md](./docs/truthfulness.md), and the boundaries are in [docs/limitations.md](./docs/limitations.md).

### Every headline claim → its proof → how to reproduce it

| Claim | Proof in the repo | Reproduce |
|---|---|---|
| Any-format ingest autocleans into one institution model | `backend/app/ingestion/` (extract → Muse structured output → deterministic normalizer) | Live demo → Express → Import; or `POST /ingest` |
| Missing required inputs are named before a solve | `check_completeness` over the six `REQUIRED_DATA` inputs (`backend/app/ingestion/check.py:14`) | Import a partial file set; the 6/6 check names the gaps |
| Contradictory data is source-attributed and electable; nothing resolves silently | `detect_conflicts` / `resolve_conflicts`; `backend/tests/test_ingestion_conflicts.py`, `test_conflict_election.py` | Import disagreeing degree maps; choose the winner in the wizard |
| One plain-language sentence becomes solver-proven term state | Muse parse → `validate_operations` → solve → `apply_operations` (only proven ops commit) | Intake: "Prof. Patel can't teach Mondays" |
| Two engines prove the same optimum; ours is faster on this problem class, and alone completes 361 sections | Benchmark table above; parity + independent hard-constraint checks in `backend/tests/test_native_solver.py` | `bash backend/scripts/build_native.sh && cd backend && .venv/bin/python scripts/benchmark.py` |
| Rankings come from outputs alone | `rank_results`: proven status → penalty → speed (`backend/app/solver/engine.py`) | Build → Compare engines (Rank 1 / Rank 2) |
| Mid-term coverage suggests only solver-proven names, zero ripple | Per-candidate CP-SAT probes with unaffected placements pinned (`propose_candidates`) | Term Change: "Prof. Chen will no longer teach this term" |
| Impossible requests yield a minimal core + proven, electable repairs | Assumption literals / deletion-minimized cores; every resolution re-solved before shown (`backend/app/services/copilot.py`) | "Diaz is taking over CS 101, MATH 201 and CS 201 personally." |
| Every cohort's ≥4-course graduation guarantee is audited | C39 audit (`GET /intelligence/margins`); 12/12, 20/20, 100/100 at scale | `backend/scripts/benchmark.py`; Full → Radar |
| Faculty elect hard/soft constraints individually before a deadline | Intake window + per-professor grid; deadline refusal tested (`backend/app/services/term.py`, `backend/tests/test_intake.py`) | Sign in as an instructor → Schedule → availability grid |
| A student's plan is verified, with a projected graduation term and named missing/conflicting inputs | Exact selector + independent re-verification + `project_graduation` (`backend/app/services/student_plan.py:74`); `backend/tests/test_student_plan.py` | Sign in as `cs2025@schedulesolve.demo` → Suggest my schedule |
| Muse Spark Open (Baseten) runs the same structured roles | 18/18 live capture, real outputs + latencies (`backend/muse-verification-open.json`) | Set `MUSE_BASE_URL` / `MUSE_MODEL` per [Meta AI tooling](#meta-ai-tooling-at-runtime); no code change |
| Voice never changes the term by itself | `POST /term-change/audio` returns a reviewable draft only (`backend/muse-verification-voice.json`) | Term Change → dictate a note; a signed-in human submits it as text |
| The test suite backs the behaviour, not just the prose | 100 tests from the repo root (99 backend + 1 smoke): solver parity, conflict election, student projection, intake deadline, department/full scales | `backend/.venv/bin/python -m pytest -q` from the repo root → `100 passed` |

## What we built vs. what we rent

Honest accounting — the rented parts are named, not hidden:

| Ours (written this hackathon) | Rented (named, not claimed) |
|---|---|
| **Native C++ solver** (540 lines, `backend/native/schedulesolve_solver.cpp`) + Python reference (`home_solver.py`) — MRV search, unit propagation, pairwise-conflict admissible bound; proves CP-SAT's optimum faster on this problem class (and completes the 361-section stress instance CP-SAT cannot) | OR-Tools CP-SAT (Google) — general solver, term change probes |
| CP-SAT timetable model with assumption-literal minimal conflict cores (`scheduling_model.py`, 634 lines) | Muse Spark / Spark Open / Voice Transcribe (Meta) — propose, never decide |
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
- **Advise a student from their record** — advising is individual: mandatory vs optional comes from the degree map the institution fed in; completed courses come from the student's own study record (pasted, or named as passed) or, only if none is given, a progress lookup from their cohort's roadmap position. Muse parses record + life ("I work Tue/Thu, I need CS 201, no 8 AMs") into typed constraints; a degree-map audit reports mandatory done / ready / co-takeable / still locked; an exact selector then recommends (mandatory-ready first, optional picks to fill, gating courses co-enrolled where the map allows), re-verified independently before it is shown. If a must-take course cannot fit, the answer says exactly that instead of quietly delaying their degree. The result also carries a **projected graduation term** derived from degree-map depth, completed courses, locked prerequisites and the verified plan — "On track for Spring 2029" or, in the tested senior case, "CS 401 pushes graduation +2 terms — projected Spring 2028". Contradictions are never resolved silently: a record that disagrees with the cohort lookup, a must-take course that only meets inside an unavailable block, or "I need CS 201" when CS 201 is already completed each come back as a named conflict with both options, and the student chooses which wins. The response also lists the **input that is missing** (e.g. an individual study record) so the projection can be made exact.
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
| `POST /intelligence/tighten` | Muse proposes typed moves from closed grammar; CP-SAT re-solves each mutated scenario. Verified moves are electable (and re-verified at `/intelligence/tighten/apply` before anything changes); rejected moves are returned labelled rejected so the coordinator can see what was refused and why. |
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
.venv/bin/python -m pytest -q   # 99 backend tests; 100 from the repo root (adds the root smoke test)
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