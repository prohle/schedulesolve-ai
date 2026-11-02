# 3:00 demo shot list — top-3 cut

Record against the **live** stack with `MODEL_API_KEY` set. Every model beat must
show a `muse-spark` badge and a latency badge. Do not ship a fallback cut.
The hero story: **messy files in any format → a recommended schedule for the
entire college/university, proven by a solver you can swap.**

Resolution 1440×900 (or 1920×1080). Cursor visible. No dead air longer than
1.5 s; fast-forward only solver waits, never the model badges.

| Time | Beat | On screen | Say / highlight |
|---|---|---|---|
| 0:00–0:15 | **The pain** | Start on the Import screen. Cut to a title card: “Every term, one coordinator. Thirty instructors. Four cohorts. One spreadsheet.” | “Every term, a department coordinator burns a week reconciling instructor constraints, degree roadmaps, rooms, and campus walk times — in a spreadsheet that is wrong the moment reality changes.” |
| 0:15–0:45 | **Import — any format** | Drop the six messy files, each a different format: `1-catalog.pdf`, `2-degree-maps.docx`, `3-cohorts.csv`, `4-faculty.txt`, `5-rooms.xlsx`, `6-campus-map.md`. Show the `MUSE-SPARK · muse-spark-1.3-contributor · Xs` badge and the completeness panel (6/6 requirements found). | “Point it at the data in whatever messy format it arrives — a PDF catalog, a Word degree map, a CSV of cohorts, an Excel room sheet. If the files answer the six requirements, Muse Spark autocleans them into one model. No spreadsheet babysitting.” |
| 0:45–1:10 | **Intake** | Intake step. Set **Speaker = Prof. Patel**. Type *“I can’t teach Mondays — committee duty. Prefer mornings.”* Click **Parse & Re-solve**. Show the typed ops and the **“Applied to the term”** toast. | “The LLM never touches the schedule. It proposes typed constraints; CP-SAT re-solves and proves the ripple. One sentence, and the change is committed to the term.” |
| 1:10–1:35 | **Build + university scale + dual engines** | Next → Build → **Solve**. Show `OPTIMAL`, the visual grid. Click **Load university scale** → Solve: 38 instructors, 41 sections, 20 cohorts, 5 programs, still `OPTIMAL` (~0.3 s). Click **Compare side by side**: CP-SAT vs the ScheduleSolve home solver — same penalty, both grids, differing sections ringed. Click **Back to story seed** → Solve, then Review (spectral μ₂, C39). | “One solve: loads, prep caps, rooms, equipment, cohort conflicts, campus walk. And this is not a toy — the entire university, thirty-eight instructors, twenty cohorts, five programs, still optimal in a blink. Choose your engine: Google's CP-SAT, or our own solver built for this — same answer, compared side by side.” |
| 1:35–2:05 | **Term change** | Term change step. The message *“Prof. Chen will no longer teach this term — who should take over her sections?”* is pre-filled; click **Rank coverage options → Apply elected coverage**. Show the ranked proposals, the Agent trace (impact → probe → choose → re-solve), and the **Before / After** grids: only CS 301 and CS 310 change. | “Reality breaks the term mid-flight. The co-pilot doesn't guess who can cover — it probes every qualified instructor with the solver. Only verified zero-ripple swaps are shown — Okafor on CS 301, Nguyen on CS 310, the rest of the board untouched.” |
| 2:05–2:25 | **Self-heal + agent trace** | Back to Intake. Type *“Diaz is taking over CS 101, MATH 201 and CS 201 personally.”* Show `INFEASIBLE`, the minimal conflict core, the Muse explanation, the **solver-verified resolutions**, and scroll the **Agent trace** panel (parse → validate → solve → conflict-core → explain → verify → apply → audit, actors badged). | “CP-SAT proves the conflict and names the minimal core. Muse translates the proof; every resolution is re-solved before it is shown. The least disruptive one applies — and the agent trace shows every step: who proposed, who proved.” |
| 2:25–2:40 | **Insights + audit** | Insights → Conflict health (μ₂, max clique, deadlock warnings). Then Audit: `APPLY`, `TERM_CHANGE`, `INGEST` events, live `muse-spark` badges. | “Spectral graph theory predicts deadlocks before the solver runs. Every accepted change lands in the audit trail — who said what, when.” |
| 2:40–3:00 | **Close** | Architecture overlay: **Muse proposes → solver proves → audit trail**. Show `docker compose up` and the repo URL. | “Messy files in, a proven schedule for the entire university out. Muse Spark proposes; the solver proves; the coordinator stays in control. ScheduleSolve AI.” |

## Recording checklist

- [ ] `MODEL_API_KEY` is set in the recording environment.
- [ ] `docker compose up --build` is up before recording.
- [ ] `POST /scenario/reset` before the first take.
- [ ] Every model badge says `muse-spark`, never a fallback.
- [ ] The Import beat drops six files in six different formats (PDF/DOCX/CSV/TXT/XLSX/MD) and the completeness panel reads 6/6.
- [ ] The Build beat shows the university-scale solve (38 instructors / 41 sections), the dual-engine comparison, and returns to the story seed before Term change.
- [ ] The self-heal beat shows the Agent trace panel with Muse Spark and CP-SAT actor badges.
- [ ] The term change before/after shows only the affected sections ringed in amber.
- [ ] The self-heal shows the minimal core + at least one verified resolution.
- [ ] The Audit Trail shows `apply` and `term_change` events.
- [ ] Video is ≤ 3:00, audio is clear, cursor does not cover the proof.
- [ ] Upload the video, set the repo public, and submit before **Nov 4, 9:00 PM ET**.
