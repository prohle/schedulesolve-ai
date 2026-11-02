"""Oversized inputs are refused before any paid model call."""

from __future__ import annotations

from app import config


def test_ingest_text_cap(client, monkeypatch):
    monkeypatch.setattr(config, "MAX_INGEST_TEXT_CHARS", 5)
    response = client.post("/ingest", json={"text": "x" * 6})
    assert response.status_code == 413


def test_message_cap(client, monkeypatch):
    monkeypatch.setattr(config, "MAX_MESSAGE_CHARS", 5)
    response = client.post("/parse", json={"message": "x" * 6})
    assert response.status_code == 413


def test_ingest_file_count_cap(client, monkeypatch):
    monkeypatch.setattr(config, "MAX_INGEST_FILES", 1)
    response = client.post(
        "/ingest/files",
        files=[
            ("files", ("a.txt", b"a", "text/plain")),
            ("files", ("b.txt", b"b", "text/plain")),
        ],
    )
    assert response.status_code == 413


def test_ingest_file_size_cap(client, monkeypatch):
    monkeypatch.setattr(config, "MAX_UPLOAD_BYTES", 4)
    response = client.post(
        "/ingest/files",
        files=[("files", ("a.txt", b"12345", "text/plain"))],
    )
    assert response.status_code == 413
