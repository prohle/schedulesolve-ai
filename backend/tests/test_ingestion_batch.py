"""Bounded ingestion: batch large dumps, then merge deterministically."""

from __future__ import annotations

import pymupdf

from app import main as app_main
from app.ingestion import batch, vision
from app.ingestion.batch import batch_chunks, merge_institution_data
from app.ingestion.conflicts import detect_conflicts
from app.ingestion.normalize import build_scenario
from app.models.ingestion import ExtractedCourse, InstitutionData


class _FakeParser:
    def __init__(self) -> None:
        self.mode = "muse-spark"
        self.model = "fake"
        self.last_latency_ms = 1
        self.calls: list[tuple[int, int]] = []

    def parse(self, text: str, images=None):
        self.calls.append((len(text), len(images or [])))
        # Return one entity: a real extraction never yields nothing, and an
        # empty result is now rejected rather than replacing the institution.
        return InstitutionData(courses=[ExtractedCourse(code="CS 101", title="Intro")])


def _png() -> bytes:
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((72, 72), "Catalog CS 101")
    return doc[0].get_pixmap(dpi=80).tobytes("png")


def test_ingest_files_batches_images_before_the_model(client, monkeypatch):
    fake = _FakeParser()
    monkeypatch.setattr(app_main, "IngestionParser", lambda: fake)
    monkeypatch.setattr(vision, "MAX_IMAGES_PER_CALL", 2)
    files = [("files", (f"p{i}.png", _png(), "image/png")) for i in range(5)]

    response = client.post("/ingest/files", files=files)
    assert response.status_code == 200
    image_calls = [n for _, n in fake.calls if n]
    assert image_calls == [2, 2, 1]
    body = response.json()
    assert body["images_read"] == 5
    assert body["batches"] == 3


def test_ingest_files_batches_text_before_the_model(client, monkeypatch):
    fake = _FakeParser()
    monkeypatch.setattr(app_main, "IngestionParser", lambda: fake)
    monkeypatch.setattr(batch, "MAX_FILES_PER_BATCH", 2)
    monkeypatch.setattr(batch, "MAX_CHARS_PER_BATCH", 100_000)
    files = [("files", (f"f{i}.txt", b"catalog", "text/plain")) for i in range(5)]

    response = client.post("/ingest/files", files=files)
    assert response.status_code == 200
    text_calls = [n for n, _ in fake.calls]
    assert len(text_calls) == 3
    assert all(n > 0 for n in text_calls)
    assert response.json()["batches"] == 3


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
