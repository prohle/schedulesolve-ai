"""Scanned pages and images -> vision requests, in provider-safe batches.

The text extractor handles digital PDFs/Office files. Real registrar folders
also contain scans and phone photos, so those pages are rendered to images and
sent to Muse Spark's vision input with the same `InstitutionData` schema.

Provider contract this module enforces:

- **at most 32 images per request** (Muse Spark's hard image-part cap). The
  default batch is 16, leaving room for a text part and retries; the value is
  clamped so a bad env var can never exceed 32.
- each PDF is bounded to `INGEST_MAX_PDF_PAGES` pages, and every page is
  downscaled to `INGEST_MAX_IMAGE_DIM` on the long edge before encoding.
- batching happens **before** the model call: `image_batches()` returns a list
  of independent requests, and the caller makes one Muse call per batch and
  merges the typed results deterministically.

No image is ever silently dropped: an unreadable image returns an explicit
note that the completeness check can surface.
"""

from __future__ import annotations

import base64
import os

import pymupdf

# Muse Spark rejects a request with more than 32 image parts. Never exceed it.
PROVIDER_MAX_IMAGES = 32
MAX_IMAGES_PER_CALL = min(
    max(1, int(os.getenv("INGEST_MAX_IMAGES_PER_CALL", "16"))),
    PROVIDER_MAX_IMAGES,
)
MAX_PDF_PAGES = max(1, int(os.getenv("INGEST_MAX_PDF_PAGES", "40")))
MAX_IMAGE_DIM = max(400, int(os.getenv("INGEST_MAX_IMAGE_DIM", "1800")))
RENDER_DPI = max(72, int(os.getenv("INGEST_RENDER_DPI", "130")))
JPEG_QUALITY = min(95, max(50, int(os.getenv("INGEST_JPEG_QUALITY", "82"))))

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tiff", ".tif"}

ImagePart = tuple[bytes, str]  # (encoded bytes, MIME type)


def is_image(filename: str) -> bool:
    name = (filename or "").lower().rsplit("/", 1)[-1]
    return any(name.endswith(ext) for ext in IMAGE_EXTS)


def _render(page: pymupdf.Page) -> ImagePart:
    """Render one page, bounded on the long edge, as JPEG for vision."""
    rect = page.rect
    longest = max(rect.width, rect.height) or 1
    zoom = min(2.0, MAX_IMAGE_DIM / longest) if longest > MAX_IMAGE_DIM else 1.0
    pix = page.get_pixmap(
        matrix=pymupdf.Matrix(zoom, zoom),
        colorspace=pymupdf.csRGB,
        alpha=False,
    )
    return pix.tobytes("jpeg", jpg_quality=JPEG_QUALITY), "image/jpeg"


def pdf_pages(content: bytes, max_pages: int | None = None) -> list[ImagePart]:
    """Render a PDF's pages to vision-ready images (bounded)."""
    limit = max_pages or MAX_PDF_PAGES
    try:
        doc = pymupdf.open(stream=content, filetype="pdf")
    except Exception:
        return []
    parts: list[ImagePart] = []
    try:
        for index, page in enumerate(doc):
            if index >= limit:
                break
            try:
                parts.append(_render(page))
            except Exception:
                continue
    finally:
        doc.close()
    return parts


def image_pages(content: bytes, filename: str) -> list[ImagePart]:
    """Turn an uploaded image (or the first frame of a multi-page one) into a
    vision-ready JPEG. Returns [] when the bytes cannot be decoded."""
    ext = "." + (filename or "").lower().rsplit(".", 1)[-1]
    try:
        doc = pymupdf.open(stream=content, filetype=ext.lstrip(".") or None)
    except Exception:
        return []
    try:
        if not len(doc):
            return []
        return [_render(doc[0])]
    except Exception:
        return []
    finally:
        doc.close()


def image_batches(images: list[ImagePart]) -> list[list[ImagePart]]:
    """Split images into independent Muse requests, never above the cap."""
    if not images:
        return []
    size = MAX_IMAGES_PER_CALL
    return [images[i:i + size] for i in range(0, len(images), size)]


def data_url(part: ImagePart) -> str:
    data, mime = part
    return f"data:{mime};base64,{base64.b64encode(data).decode('ascii')}"
