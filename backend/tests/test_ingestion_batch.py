"""Bounded ingestion: batch large dumps, then merge deterministically."""

from __future__ import annotations

from app.ingestion import batch
from app.ingestion.batch import batch_chunks, merge_institution_data
from app.ingestion.conflicts import detect_conflicts
from app.ingestion.normalize import build_scenario
from app.models.ingestion import ExtractedCourse, InstitutionData


def test_batch_chunks_splits_by_file_count(monkeypatch):
    monkeypatch.setattr(batch, "MAX_FILES_PER_BATCH", 2)
    monkeypatch.setattr(batch, "MAX_CHARS_PER_BATCH", 100_000)
    out = batch_chunks([(f"f{i}.txt", "x") for i in range(5)])
    assert len(out) == 3
    assert out[0].count("--- f") == 2
    assert out[-1].count("--- f") == 1


def test_batch_chunks_splits_by_characters(monkeypatch):
    monkeypatch.setattr(batch, "MAX_FILES_PER_BATCH", 99)
    monkeypatch.setattr(batch, "MAX_CHARS_PER_BATCH", 50)
    out = batch_chunks([("a.txt", "x" * 40), ("b.txt", "y" * 40)])
    assert len(out) == 2


def test_merge_preserves_every_source():
    a = InstitutionData(courses=[ExtractedCourse(code="CS 101", title="Intro", source="a.pdf")])
    b = InstitutionData(courses=[ExtractedCourse(code="CS 101", title="Intro", source="b.pdf")])
    merged = merge_institution_data([a, b])
    assert len(merged.courses) == 2
    assert {c.source for c in merged.courses} == {"a.pdf", "b.pdf"}


def test_merge_then_normalize_and_conflict_detection():
    a = InstitutionData(
        courses=[ExtractedCourse(code="CS 101", title="Intro", seats=30, source="a.pdf")])
    b = InstitutionData(
        courses=[ExtractedCourse(code="CS 101", title="Intro", seats=60, source="b.pdf")])
    merged = merge_institution_data([a, b])
    # Identical keys collapse in the normalizer (first copy wins)…
    scenario = build_scenario(merged)
    assert [c.code for c in scenario.courses] == ["CS 101"]
    # …while the disagreement is surfaced for the coordinator to resolve.
    conflicts = detect_conflicts(merged)
    assert conflicts
    assert conflicts[0].entity == "courses"
