"""Muse Voice Transcribe: a voice note becomes a *draft* scheduling request.

The file endpoint is a single multipart POST. We keep the audio in memory
(capped at 32 MB) and return only the transcript. A transcript is untrusted
input — speaker identity cannot be established from audio — so nothing is
parsed, solved, or applied until a signed-in coordinator reviews the text
and submits it through the normal parse -> solve -> verify pipeline.
"""

from __future__ import annotations

import json
import re

import httpx
from fastapi import HTTPException

from app import config
from app.services import guard

ASR_MODEL = config.MUSE_ASR_MODEL
MAX_BYTES = 32 * 1024 * 1024


def clean_transcript(text: str) -> str:
    """Collapse ASR whitespace, stutters and duplicate sentence punctuation."""
    text = re.sub(r"\s+", " ", text or "").strip()
    text = re.sub(r"\b([A-Za-z]+)(?:\s+\1\b)+", r"\1", text, flags=re.IGNORECASE)
    text = re.sub(r"([.!?])\1+", r"\1", text)
    return text.strip()


def transcribe_wav(audio: bytes, filename: str = "note.wav") -> str:
    if not config.MUSE_ASR_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="Voice transcription needs MUSE_API_KEY (Meta Model API).")
    if not guard.model_allowed():
        raise HTTPException(
            status_code=503,
            detail="Demo protection: the model budget is exhausted, so voice is "
                   "temporarily unavailable. Typed intake still works.")
    if len(audio) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Audio exceeds the 32 MB limit.")
    request = {
        "model": ASR_MODEL,
        "audioEncoding": "WAV",
        "mode": "PUSH_TO_TALK",
    }
    files = {
        "request": (None, json.dumps(request), "application/json"),
        "audio": (filename, audio, "audio/wav"),
    }
    try:
        with httpx.Client(timeout=config.MUSE_TIMEOUT_S) as client:
            response = client.post(
                f"{config.MUSE_ASR_BASE_URL}/asr/transcribe",
                headers={"Authorization": f"Bearer {config.MUSE_ASR_API_KEY}"},
                files=files,
            )
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Muse Voice Transcribe failed: {exc.response.text[:240]}",
        ) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=502, detail=f"Muse Voice Transcribe unavailable: {exc}") from exc

    transcript = (response.json().get("transcript") or "").strip()
    if not transcript:
        raise HTTPException(status_code=422, detail="No speech detected in the recording.")
    # ASR occasionally repeats a word at a turn boundary ("Tuesdays Tuesdays")
    # or doubles the final period. Keep the draft readable without changing the
    # speaker's meaning.
    return clean_transcript(transcript)
