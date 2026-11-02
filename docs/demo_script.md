# ScheduleSolve AI — demo video script

> The shipped video is a **real-time screen recording of the running
> application** (CDP `Page.startScreencast`), not a screenshot slideshow.
> Each beat is time-compressed to its narration length, so live Muse latency
> appears as a fast-forward.
>
> **B-roll licence.** The non-app footage (opening corridor shot, graduation
> end card) is HeyGen royalty-free stock used under a paid HeyGen
> subscription. Every frame of the product is the real app. Full asset
> provenance: [docs/truthfulness.md](./truthfulness.md#assets-and-licences).
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

The narration is the pitch script, one paragraph per beat, 12 beats. It is
not edited, grouped, or paraphrased for the video. The shipped cut is
**181.4 s (3:01)** end to end — 1.4 s
over the 3:00 guidance, all of it trailing end-card hold. The assembly step
enforces `total <= 180.0` before assembling, so a rebuild produces a compliant
cut; the shipped file was held 1.4 s longer at the end card.

## Beats (12 + silent end-card hold)

1. **Sarah** — landing cold open: one colliding course can delay
   graduation by a year.
2. **The registrar's chair** — landing scale story: the operational
   heartbeat of a whole university.
3. **Spreadsheets collapse** — sample-account coordinator login → Guided
   build (Express) → Import, six institutional files selected
   (PDF/DOCX/CSV/TXT/XLSX/MD).
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
6. **Phase Three** — Build: Department scale → Head-to-head,
   ScheduleSolve solver vs CP-SAT ranked Rank 1 / Rank 2 from outputs
   alone (recorder asserts "C-Solve ranks first"),
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

- [ ] Backend on the Baseten env (above) + frontend on :3021
      (`BACKEND_URL=http://localhost:8012`), scenario reset
- [ ] Narration read from the pitch script, one paragraph per beat — no
      edits, no regrouping
- [ ] Every live-model gate passes while recording (no fallback; the
      open-weights model name is on screen at every Muse beat)
- [ ] Spot-check frames (text only): engine verdict, term-change After grid,
      documented faculty constraints, student Projected term, end cards
- [ ] Upload as the `demo-video` release asset; YouTube upload uses the same file
