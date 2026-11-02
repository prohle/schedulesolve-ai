# ScheduleSolve AI — demo video script (live Puppeteer screencast)

> The shipped video is a **real-time Puppeteer screencast** of the running
> application (`local-demo/record_live.js`, CDP `Page.startScreencast`),
> not a screenshot slideshow. Each beat is time-compressed to its narration
> length by `local-demo/assemble_live.py`, so live Muse latency appears as
> a fast-forward. Narration is synthesized locally with the 05-media
> Chatterbox pipeline (`dee_us` reference, diction-weighted) and gated by
> faster-whisper transcription checks. Recorded with `MODEL_API_KEY` set —
> every Muse beat shows the live `muse-spark` badge, never `MOCK`.

## Beats (7 + end card, ≈2:55 total)

1. **Ingestion** — coordinator demo login → Import: six files (PDF/DOCX/CSV/
   TXT/XLSX/MD) → Muse Spark autoclean → typed institutional model,
   completeness-checked.
2. **Intake** — "Prof. Patel can't teach Mondays — committee duty" →
   schema-validated operations, applied to the term.
3. **Dual-engine ranking** — Build at Department scale → **Compare side
   by side**: CP-SAT vs the AI-developed native engine on identical
   inputs; verdict banner ranks Rank 1 / Rank 2 from outputs alone
   (status → penalty → speed). The race runs at department scale, where
   the native solver's win is the measured one (same proven objective,
   lower proof time — `docs/solver_evidence.md`); the recorder asserts
   "ScheduleSolve solver (ours) ranks first" before marking the beat.
4. **University scale + publish** — Load university scale (38 instructors,
   41 sections, 20 cohorts, 5 programs) → coordinator publishes the
   verified timetable.
5. **Role-based change** — sign in as Prof. Chen: only her sections visible →
   "I can't teach Fridays" change request → coordinator approves →
   co-pilot re-solves, schedule re-publishes, her grid updates.
6. **Term change** — "Prof. Chen will no longer teach this term" (the
   change lasts through the end of the term) → feasibility probes over
   every qualified instructor → ranked zero-ripple reassignment with the
   roster source per candidate → coordinator elects a proven cover per
   section → Apply elected coverage → before/after grids, agent trace visible.
7. **Impossible override + capacity** — Diaz overload → minimal conflict
   core → Muse explanation → every repair re-proven before it is shown;
   then Intelligence → Planning → "20% growth" what-if re-solved with
   utilization/guarantee deltas; closing end card (live demo + repo URLs).

Narration text: `local-demo/narration.txt` (one paragraph per beat) — the
canonical pitch in `docs/submission.md`, grouped into 7 beats. Time it
before assembly: total narration must stay ≤2:55 at the TTS pace used.

> Status: shipped video re-recorded Oct 30 against this script (2:51) —
> beats asserted on screen during recording (department compare verdict,
> "38 faculty · 41 sections", term-change result, Diaz explanation), and
> frame-checked after assembly, including the end card.

## Recording checklist

- [ ] Stack up with live key (`./start.sh --prod`), scenario reset, fresh DB
- [ ] `cd local-demo && BASE_URL=http://localhost:3021 node record_live.js`
- [ ] `python3 narrate.py --voice dee_us --cfg 2.8 --expr 0.15` + whisper gate
- [ ] `python3 assemble_live.py live-final.mp4` (≤3:00), spot-check frames:
      beat 3 verdict banner, beat 6 term change result, beat 5 applied request
- [ ] Upload as the `demo-video` release asset; YouTube upload uses the same file
