"""Batch large institutional dumps before the Muse call.

The demo's eight files fit in one request, but a registrar can drop a zip of
dozens. Every model has a context window, and multimodal requests have a hard
image-part cap, so ingestion must not blindly concatenate an unbounded dump.

This module groups extracted file text into bounded batches and merges the
schema-validated `InstitutionData` deterministically:

- identical duplicates collapse in `normalize.build_scenario` (first copy
  wins, by design);
- records that share a key but disagree are preserved and surfaced by
  `detect_conflicts` with their sources, so the coordinator elects the winner.

The model still only proposes typed entities. It never assembles the solver's
`Scenario` and never decides the ids that reach CP-SAT.
"""

from __future__ import annotations

import os

from app.models.ingestion import InstitutionData

# Eight files / 60k characters is comfortably inside Muse Spark's context and
# matches the demo's any-format import. Both are env-tunable.
MAX_FILES_PER_BATCH = int(os.getenv("INGEST_MAX_FILES_PER_BATCH", "8"))
MAX_CHARS_PER_BATCH = int(os.getenv("INGEST_MAX_CHARS_PER_BATCH", "60000"))


def batch_chunks(chunks: list[tuple[str, str]]) -> list[str]:
    """Group (filename, text) pairs into prompt-sized batches.

    A single oversized file gets its own batch rather than being silently
    truncated; the model's schema validation and the completeness report will
    tell the user what was understood.
    """
    batches: list[str] = []
    current: list[str] = []
    chars = 0

    for name, text in chunks:
        piece = f"\n--- {name} ---\n{text}"
        too_many = len(current) >= MAX_FILES_PER_BATCH
        too_long = chars + len(piece) > MAX_CHARS_PER_BATCH
        if current and (too_many or too_long):
            batches.append("".join(current))
            current = []
            chars = 0
        current.append(piece)
        chars += len(piece)

    if current:
        batches.append("".join(current))
    return batches or [""]


def merge_institution_data(parts: list[InstitutionData]) -> InstitutionData:
    """Concatenate batch extractions; the deterministic layers do the rest."""
    if not parts:
        return InstitutionData()
    if len(parts) == 1:
        return parts[0]

    summaries: list[str] = []
    for part in parts:
        summary = (part.summary or "").strip()
        if summary and summary not in summaries:
            summaries.append(summary)

    merged = InstitutionData(summary=" · ".join(summaries))
    for part in parts:
        merged.buildings.extend(part.buildings)
        merged.courses.extend(part.courses)
        merged.instructors.extend(part.instructors)
        merged.rooms.extend(part.rooms)
        merged.cohorts.extend(part.cohorts)
        merged.degree_map.extend(part.degree_map)
        merged.distances.extend(part.distances)
    return merged
