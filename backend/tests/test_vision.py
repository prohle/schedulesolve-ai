"""Scanned pages: render, bound, and batch under the provider's image cap."""

from __future__ import annotations

from types import SimpleNamespace

import pymupdf
import pytest

from app.ingestion import vision
from app.ingestion.parser import IngestionParser
from app.models.ingestion import InstitutionData


def _png() -> bytes:
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((72, 72), "Catalog CS 101")
    return doc[0].get_pixmap(dpi=80).tobytes("png")


def test_pdf_pages_render_to_jpeg():
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((72, 72), "Catalog CS 101")
    pages = vision.pdf_pages(doc.tobytes())
    assert pages
    assert pages[0][1] == "image/jpeg"
    assert pages[0][0][:2] == b"\xff\xd8"  # JPEG SOI


def test_image_pages_decodes_an_uploaded_png():
    pages = vision.image_pages(_png(), "scan.png")
    assert len(pages) == 1
    assert pages[0][1] == "image/jpeg"


def test_image_batches_never_exceed_the_provider_cap(monkeypatch):
    monkeypatch.setattr(vision, "MAX_IMAGES_PER_CALL", 2)
    batches = vision.image_batches([(b"x", "image/jpeg")] * 5)
    assert [len(b) for b in batches] == [2, 2, 1]
    assert all(len(b) <= vision.PROVIDER_MAX_IMAGES for b in batches)


def test_parser_refuses_an_oversized_image_request():
    parser = IngestionParser()
    with pytest.raises(ValueError):
        parser.parse("", images=[(b"x", "image/jpeg")] * (vision.PROVIDER_MAX_IMAGES + 1))


def test_parser_falls_back_when_the_budget_degrades(monkeypatch):
    from app.services import guard

    monkeypatch.setattr(guard, "model_allowed", lambda: False)
    parser = IngestionParser()
    parser._client = object()  # would be called if the guard allowed it
    out = parser.parse("catalog")
    assert out is not None
    assert parser.mode == "deterministic"


def test_parser_builds_a_multimodal_schema_request():
    captured: dict = {}

    def fake_parse(**kwargs):
        captured.update(kwargs)
        message = SimpleNamespace(parsed=InstitutionData())
        return SimpleNamespace(choices=[SimpleNamespace(message=message)])

    client = SimpleNamespace(beta=SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(parse=fake_parse))))
    parser = IngestionParser()
    parser._client = client
    parser.mode = "muse-spark"
    parser.parse("catalog", images=[(b"image-bytes", "image/jpeg")])

    content = captured["messages"][1]["content"]
    assert content[0] == {"type": "text", "text": "catalog"}
    assert content[1]["type"] == "image_url"
    assert content[1]["image_url"]["url"].startswith("data:image/jpeg;base64,")
    assert captured["response_format"] is InstitutionData
    assert captured["model"]
