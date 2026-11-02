# ScheduleSolve AI — demo video script (live Puppeteer screencast)

> The shipped video is a **real-time Puppeteer screencast** of the running
> application (`local-demo/record_live.js`, CDP `Page.startScreencast`),
> not a screenshot slideshow. Each beat is time-compressed to its narration
> length by `local-demo/assemble_live.py`, so live Muse latency appears as
> a fast-forward. Narration is synthesized locally with the 05-media
> Chatterbox pipeline (`dee_us` voice, diction-weighted).
>
> **Live-model gate (Baseten).** The recording backend runs Muse Spark
> Open on Baseten: `MUSE_BASE_URL=https://inference.baseten.co/v1`,
> `MUSE_MODEL=meta-models/muse-spark-open-1026`, `MODEL_API_KEY` = the
> Baseten key. Every Muse beat in the recorder asserts the on-screen live
> `muse-spark` badge **and** the `meta-models/muse-spark-open-1026` model
> name (`assertLiveMuse`, `EXPECT_MODEL`); a fallback or a different
> model fails the recording instead of shipping a video that claims live
> Muse it did not use. This is the hackathon's open-weights path running
> the product, not a separate verification script.

## Narration — 100% the final pitch

`local-demo/narration.txt` is **byte-identical** to `local_final_pitch.md`
(verify: `sha256sum local_final_pitch.md local-demo/narration.txt`), one
paragraph per beat, 12 beats. It is not edited, grouped, or paraphrased
for the video. Total narration at the TTS pace used (`--speed 1.08`) is
≈173.7 s + a 4 s silent end-card hold = ≈177.7 s, inside the 3:00 limit;
`assemble_live.py` asserts the total before assembling.

## Beats (12 + silent end-card hold)

1. **Sarah** — landing cold open: one colliding course can delay
   graduation by a year.
2. **The registrar's chair** — landing scale story: the operational
   heartbeat of a whole university.
3. **Spreadsheets collapse** — one-tap coordinator login → Express →
   Import, six institutional files selected (PDF/DOCX/CSV/TXT/XLSX/MD).
4. **Phase One** — Process: Muse Spark autocleans the files into one
   typed institution model; completeness and missing inputs named on
   screen (live Baseten badge asserted).
5. **Phase Two** — coordinator Intake: "Professor Patel cannot teach
   Mondays" → schema-validated operations applied to the term. Then
   Patel signs in **herself, before the deadline**, types plain English
   ("I have childcare on Mondays. A 3-hour class block works better for
   me. CS 301 is my preference."), attaches committee evidence, and the
   panel shows **what Muse documented**: hard candidates are honoured
   only with evidence — without it they are downgraded to the strongest
   soft preference (avoid, weight 10), never dropped; soft wishes
   (3-hour block pattern, course preference) are documented as soft.
6. **Phase Three** — Build: Department scale → Compare engines,
   ScheduleSolve solver vs CP-SAT ranked Rank 1 / Rank 2 from outputs
   alone (recorder asserts "ScheduleSolve solver (ours) ranks first"),
   then University scale (38 faculty · 41 sections asserted).
7. **Phase Four** — Term Change: "Prof. Chen will no longer teach this
   term" → solver probes every qualified instructor → zero-ripple
   verified coverage, elected and applied; before/after grids, agent
   trace (live Baseten badge asserted).
8. **Phase Five** — Diaz impossible override → minimal conflict core →
   Muse plain-English explanation → verified repairs and the agent
   trace naming every actor (live Baseten badge asserted).
9. **Phase Six** — student signs in, pastes a study record, gets a
   verified plan with a projected graduation term; record-vs-lookup
   conflicts are the student's choice. Muse Voice Transcribe is the
   draft-only voice path (`POST /term-change/audio`; voice never changes
   the term by itself).
10. **Every stakeholder** — coordinator publishes; Prof. Patel signs in
    and sees only her own sections.
11. **Open weights on Baseten** — end card: recorded live against Muse
    Spark Open (`meta-models/muse-spark-open-1026`) via Baseten, 18/18
    live structured calls in `backend/muse-verification-open.json`;
    same code self-hosted by configuration alone.
12. **Close** — "ScheduleSolve AI — ensuring no student loses a year to
    a spreadsheet again." Live demo + repo URLs; silent hold.

## Recording checklist

- [ ] Backend on Baseten env (above) + frontend on :3021
      (`BACKEND_URL=http://localhost:8012`), scenario reset
- [ ] `sha256sum local_final_pitch.md local-demo/narration.txt` — identical
- [ ] `cd local-demo && python3 narrate.py --voice dee_us --cfg 2.8 --expr 0.15 --speed 1.08`
- [ ] `BASE_URL=http://localhost:3021 node record_live.js` — all
      `assertLiveMuse` gates pass (no fallback, open-weights model on screen)
- [ ] `python3 assemble_live.py final.mp4` (≤3:00), spot-check frames
      (text only): engine verdict, term-change After grid, documented
      faculty constraints, student Projected term, end cards
- [ ] Upload as the `demo-video` release asset; YouTube upload uses the same file
