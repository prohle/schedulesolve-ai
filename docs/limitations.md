# Honest limitations

What ScheduleSolve AI does **not** do, stated plainly. Each item names the
code that bounds it, so a judge can verify the boundary instead of taking
our word for it. Scoped claims are stronger than broad ones.

## Data truthfulness

- **The shipped institution is synthetic.** "Northgate University" (14
  buildings across 9 campus quads, 83 rooms, 148 faculty, 271
  courses/sections, 20 undergraduate majors + 5 master's + 5 PhD programs +
  8 minors, 110 cohorts, 35 named PhD students) is generated demo data, not a
  real registrar extract.
  The app labels it **Demo institution** and the first-page preview labels
  itself **Illustrative sample**. Real institutions replace it through
  Import / Settings → Update institution data.
- **Simulated faculty feedback is simulated.** The "Simulate all" buttons
  generate randomized hard blackouts and soft preferences, stored with the
  note "Simulated faculty feedback (demo)." They are useful for walking the
  full flow; they are not real staff input. Real input comes from each
  signed-in professor before the deadline. The randomization is realistic in
  shape (early-morning/Friday avoidances, sparse committee blackouts, course
  wishes) but it is still generated.
- **Randomized audit scenarios are generated, not real institutions.**
  `backend/app/data/random_scenario.py` perturbs the shipped structure with
  seeded cohort sizes, faculty tracks/caps, closures, blackouts, enrollment
  and catalog decisions. They are for feasibility/performance testing, not
  for presenting as a real registrar extract.
- **The time grid is stored but not fully interval-scheduled.** Coordinators
  can set the teaching day, period lengths and meeting-pattern catalog
  (`TimeGrid` / `MeetingPattern`, persisted and editable). The solver currently
  schedules the four 90-minute base grid plus weekly/block patterns. A term
  that mixes 50-, 80- and 170-minute classes in one day needs the
  interval-scheduling solver upgrade; the data model already carries the
  configuration.
- **Faculty load is a policy abstraction.** Load is credits × a sub-linear
  enrollment factor (default exponent 0.7), not a timesheet. The coordinator
  sets the exponent, multiplier, full-time threshold and research/teaching
  track factors. It is auditable from placements, but it is a model.
- **PhD reservations are records, not timetable placements.** A 1-3 credit
  reading/research course has no fixed weekly meeting; the system enforces
  PhD-only, Fall-only, credit range and the professor's 3-5 student Fall cap,
  and keeps the durable record.
- **Catalog decisions are term-scoped.** Not-offered, dormant and special-topic
  records carry a term label and reason; there is still one current scenario
  per deployment (no multi-term versioning).
- **The demo institution generator is a fixture.** The shipped Northgate
  structure is generated from code so the demo is reproducible; it is the
  equivalent of the public preview fixture. Every runtime configuration the
  coordinator changes — policy, time grid, calendar, offerings, special
  topics, students, PhD reservations, pins, enrollments — lives in the
  persisted `Scenario`/database and is editable through the API. Real
  institutions replace the fixture through Import / Settings, not by editing
  code.
- **National holidays are advisory.** The system suggests common national
  holidays and term dates; every holiday/swap is stored as an editable record
  and can be overridden with local or religious holidays.
- **Two real solvers, not a SAT/SMT race.** The engines are OR-Tools CP-SAT
  and the ScheduleSolve native C++ search (plus a greedy first-descent). There
  is no Z3/SMT engine; earlier landing copy that implied one has been removed.
- **No fabricated timings in the public preview.** Engine timings and
  utilization values are shown after a real signed-in solve. The preview's
  charts are explicitly sample data.

## Input

- **No OCR.** Image files (`.png/.jpg/.webp/.gif/.bmp/.tiff`) are marked
  "no text layer to extract" and contribute an `[unreadable]` note; a
  scanned PDF whose pages carry no text layer extracts to nothing
  (`backend/app/ingestion/extract.py`). The completeness check then tells
  the coordinator exactly which of the six requirements still needs a
  readable copy — it never guesses the missing content.
- **Autoclean quality is bounded by the source.** Muse Spark structures
  what the files say; if the catalog omits a course's equipment or a
  faculty sheet omits a qualification, the model has neither, and the
  solve is only as complete as the input. The Import review step (keep /
  remove per entity) is the human correction point before anything is
  applied (`POST /ingest/apply` builds only from what was kept).
- **One institution, one current scenario.** There is a single current
  scenario per deployment (plus its audit ledger). Multi-term versioning,
  concurrent coordinators editing the same term, and cross-institution
  federation are not modeled.

## Models

- **Without a key, model roles degrade — visibly, not silently.** Ingest,
  parse, explain, and tighten fall back to a deterministic mock/template
  path, and every response carries `parser_mode` / `muse_mode` plus the
  model name when live. A `MOCK` badge in the UI always means exactly
  that; the demo video was recorded live and shows `muse-spark` badges.
- **Live latency is real.** Muse Spark parse/explain calls measure
  ~3–42 s (`backend/muse-verification.json`); the UI shows the latency
  badge rather than hiding the wait. Every model call has a hard timeout
  (`MUSE_TIMEOUT_S`, default 120 s) after which the deterministic
  fallback takes over.
- **First-person requests need a speaker.** "I can't teach Fridays" is
  ambiguous without identity, so the intake requires the speaker picker
  (or a signed-in instructor identity) for first-person messages.
- **Contributor-mode caveat.** The shipped configuration uses
  `muse-spark-1.3-contributor` because all data here is synthetic. A real
  institution must switch to standard mode (`muse-spark-1.3`) so staff
  data never trains future models — it is a one-line env change
  (`MUSE_MODEL`), documented in `backend/app/config.py`.

## Solvers

- **The native solver's speed claim is scoped to this problem class.**
  It proves CP-SAT's optimum faster on the measured seed /
  department / university instances, and is the only engine to
  complete the full-university stress instance (361 sections) (`docs/solver_evidence.md`,
  `backend/scripts/benchmark.py`). CP-SAT remains the better
  general-purpose solver and still powers the term change feasibility
  probes; we claim no general superiority.
- **The Python reference search cannot prove optimality at scale.** It
  reaches the same penalty but exhausts its 5 s budget unproven at
  department/university scale (`HOME_SOLVER_TIME_LIMIT_S`) — that
  measured gap is why the search core is native C++. If the native
  binary is unbuilt, the system transparently falls back to the Python
  reference (`backend/app/solver/native_solver.py`).
- **Solve budget.** CP-SAT runs under `SOLVER_TIME_LIMIT_S` (default
  60 s). Measured envelope: CP-SAT proves the default institution
  (148 instructors / 271 sections / 110 cohorts) optimal in ~8 s; at
  the full-university stress scale (198 instructors / 361 sections /
  100 cohorts) it finds no feasible timetable inside the budget and
  reports `unknown` — as do all engines on timeout, never a fabricated
  "infeasible". The native solver proves that instance optimal in
  ~5.9 s. Instances beyond the stress scale are unmeasured, not claimed.
- **The story seed intentionally fails the four-course guarantee**
  (2/4 cohorts) — it is the tightener's demo world. Department and
  university scales hold 12/12 and 20/20 (README benchmark table).

- **The solver assigns a weekly pattern; the calendar layer adds real dates.**
  The University Calendar stores dated holidays and day swaps ("Friday
  follows Tuesday"), maps each date to the effective weekday pattern, and
  audits actual meetings against the nominal pattern. A swap reuses the
  solver's weekly assignment, so it introduces no new conflicts. A holiday
  that is not made up by a swap shows a meeting shortfall in the audit
  rather than silently disappearing.

## Voice

- **Voice is a draft, never an instruction.** `POST /term-change/audio`
  returns a transcript and nothing else: speaker identity cannot be
  established from a recording (anyone can sound like Prof. Chen), so no
  parse, solve, or change runs until a signed-in coordinator reviews the
  text and submits it through the typed flow (`TranscriptDraft` in
  `backend/app/main.py`, `backend/app/services/voice.py`).
- **Upload format is 24 kHz mono WAV** (`audioEncoding: WAV`). Spelled-out
  titles from speech recognition are normalized deterministically before
  parsing; free-form dictation in other formats is not accepted yet.

## Platform

- **Demo-grade auth.** PBKDF2 password hashes + hashed bearer sessions,
  sized for a hackathon demo and a single coordinator office — not an
  institutional SSO story. Demo accounts ship with password `demo1234`
  and are labeled as such on the login screen.
- **Persistence is Postgres 18 in Docker (required; no SQLite mode).**
  The audit ledger is append-only by design; resetting a scenario
  returns the term to seed but keeps the provenance history.
- **The audit trail records submissions and change events**, not
  keystrokes or rejected drafts; infeasible instructor requests return
  with the solver-backed explanation and are visible to the coordinator
  in the change-request queue.
