"""Any-format file -> text extraction for messy institutional input.

The winning input story is: *drop whatever the registrar, the department
admin, and three instructors each had lying around* — a PDF catalog, an
Excel room sheet, a Word memo, CSV exports, JSON dumps, plain-text emails,
all zipped together. This layer turns every text-bearing format into plain
text first:

  .txt .md .csv .tsv .json .html .xml .yaml   decoded as-is (UTF-8)
  .pdf                                        pypdf text layer
  .docx                                       stdlib zip + WordprocessingML
  .xlsx                                       stdlib zip + shared strings/sheets
  .zip                                        recursed, member by member
  .png .jpg .jpeg .webp .gif                  rendered to vision pages by
                                              app.ingestion.vision (see
                                              POST /ingest/files); this
                                              extractor returns a note if
                                              called directly
  anything else                               best-effort UTF-8 salvage

No format is rejected: worst case the file contributes a visible
"[unreadable]" note, so the completeness check can tell the user exactly
which input still needs a readable copy.
"""

from __future__ import annotations

import io
import zipfile
from xml.etree import ElementTree as ET

TEXT_EXTS = {".txt", ".md", ".csv", ".tsv", ".json", ".html", ".htm",
             ".xml", ".yaml", ".yml", ".log", ".text"}
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tiff"}


def _ext(filename: str) -> str:
    name = filename.lower().rsplit("/", 1)[-1]
    return "." + name.rsplit(".", 1)[-1] if "." in name else ""


def _pdf_text(content: bytes) -> str:
    from pypdf import PdfReader
    reader = PdfReader(io.BytesIO(content))
    return "\n".join((page.extract_text() or "") for page in reader.pages)


def _docx_text(content: bytes) -> str:
    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    with zipfile.ZipFile(io.BytesIO(content)) as z:
        xml = z.read("word/document.xml")
    root = ET.fromstring(xml)
    paras: list[str] = []
    for p in root.iter(f"{{{ns['w']}}}p"):
        text = "".join(t.text or "" for t in p.iter(f"{{{ns['w']}}}t"))
        if text.strip():
            paras.append(text)
    return "\n".join(paras)


def _xlsx_text(content: bytes) -> str:
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    m = ns["m"]
    with zipfile.ZipFile(io.BytesIO(content)) as z:
        names = z.namelist()
        shared: list[str] = []
        if "xl/sharedStrings.xml" in names:
            root = ET.fromstring(z.read("xl/sharedStrings.xml"))
            for si in root.iter(f"{{{m}}}si"):
                shared.append("".join(t.text or "" for t in si.iter(f"{{{m}}}t")))
        sheets = sorted(n for n in names
                        if n.startswith("xl/worksheets/sheet") and n.endswith(".xml"))
        out: list[str] = []
        for sheet in sheets:
            root = ET.fromstring(z.read(sheet))
            for row in root.iter(f"{{{m}}}row"):
                cells: list[str] = []
                for c in row.iter(f"{{{m}}}c"):
                    v = c.find(f"{{{m}}}v")
                    inline = c.find(f"{{{m}}}is")
                    if inline is not None:
                        cells.append("".join(t.text or "" for t in inline.iter(f"{{{m}}}t")))
                    elif v is not None and v.text is not None:
                        cells.append(shared[int(v.text)] if c.get("t") == "s"
                                     and int(v.text) < len(shared) else v.text)
                    else:
                        cells.append("")
                line = " | ".join(cells).strip(" |")
                if line.strip():
                    out.append(line)
    return "\n".join(out)


def extract_text(filename: str, content: bytes) -> str:
    """Best-effort plain text for one uploaded file (see module docstring)."""
    ext = _ext(filename or "")
    try:
        if ext == ".zip":
            parts: list[str] = []
            with zipfile.ZipFile(io.BytesIO(content)) as z:
                for name in z.namelist():
                    if name.endswith("/"):
                        continue
                    parts.append(f"\n--- {name} ---\n" + extract_text(name, z.read(name)))
            return "".join(parts)
        if ext == ".pdf":
            return _pdf_text(content)
        if ext == ".docx":
            return _docx_text(content)
        if ext == ".xlsx":
            return _xlsx_text(content)
        if ext in IMAGE_EXTS:
            return (f"[image file {filename}: no extractable text layer — "
                    f"paste or transcribe its contents, or export it as PDF/text]")
        return content.decode("utf-8", errors="replace")
    except Exception as exc:  # corrupt or exotic file: never kill the intake
        return f"[unreadable file {filename}: {type(exc).__name__} — skipped]"
