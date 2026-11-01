"""Data-ingestion parser: free-form institutional dump -> typed entities.

Real path: Muse Spark structured output (`InstitutionData`) — the LLM
autocleans the messy dump. Mock path: a deterministic line parser for the same
free-form shapes, so the ingestion flow is fully demoable with zero credits.

Either way, the output feeds `normalize.build_scenario` and every id is
slugified there — the LLM never decides the final ids that reach the solver.
"""

from __future__ import annotations

import logging
import re
from typing import Optional

from app import config
from app.models.ingestion import (
    ExtractedCohort,
    ExtractedCourse,
    ExtractedDistance,
    ExtractedInstructor,
    ExtractedRequirement,
    ExtractedRoom,
    InstitutionData,
)
from app.ingestion.prompts import INGESTION_SYSTEM_PROMPT

logger = logging.getLogger(__name__)

COURSE_REST = re.compile(r"(MWF|TTh|block)\s*,\s*(lecture|lab|seminar)\s*,\s*(\d+)\s*seats?", re.I)
SECTION_HINTS = (
    ("catalog", "course"), ("course", "course"),
    ("faculty", "instructor"), ("staff", "instructor"), ("instructor", "instructor"),
    ("cohort", "cohort"), ("student", "cohort"),
    ("room", "room"), ("facilit", "room"),
    ("campus", "campus"), ("building", "campus"),
    ("degree", "degree"), ("roadmap", "degree"), ("map", "degree"),
)


class IngestionParser:
    def __init__(self) -> None:
        self.mode: str = "mock" if not config.MUSE_API_KEY else "muse-spark"
        self.model: str | None = config.MUSE_MODEL if config.MUSE_API_KEY else None
        self.last_latency_ms: int | None = None
        self._client = None
        if config.MUSE_API_KEY:
            from openai import OpenAI
            self._client = OpenAI(
                base_url=config.MUSE_BASE_URL, api_key=config.MUSE_API_KEY,
                timeout=config.MUSE_TIMEOUT_S)

    def parse(self, text: str) -> InstitutionData:
        import time
        t0 = time.perf_counter()
        if self._client is None:
            parsed = mock_ingest(text)
            self.last_latency_ms = int((time.perf_counter() - t0) * 1000)
            return parsed
        try:
            response = self._client.beta.chat.completions.parse(
                model=config.MUSE_MODEL,
                messages=[
                    {"role": "system", "content": INGESTION_SYSTEM_PROMPT},
                    {"role": "user", "content": text},
                ],
                response_format=InstitutionData,
                reasoning_effort=config.MUSE_REASONING_EFFORT,
            )
            parsed: Optional[InstitutionData] = response.choices[0].message.parsed
            if parsed is None:
                raise ValueError("model returned no parsed data")
            self.last_latency_ms = int((time.perf_counter() - t0) * 1000)
            logger.info("muse-spark ingestion ok (model=%s)", config.MUSE_MODEL)
            return parsed
        except Exception:
            logger.exception("Muse Spark ingestion failed; falling back to mock parser")
            parsed = mock_ingest(text)
            self.last_latency_ms = int((time.perf_counter() - t0) * 1000)
            self.mode = "mock"
            return parsed


def _current_section(line: str, current: Optional[str]) -> Optional[str]:
    low = line.lower()
    if ":" in line:
        for hint, sec in SECTION_HINTS:
            if hint in low:
                return sec
    return current


def _parse_course_rest(rest: str):
    pattern, rtype, seats = "MWF", "lecture", 30
    m = COURSE_REST.search(rest)
    if m:
        pattern, rtype, seats = m.group(1).lower(), m.group(2).lower(), int(m.group(3))
    equipment = [w.strip() for w in rest.split(",")[3:] if w.strip() and not w.strip().endswith("seats")]
    return pattern, rtype, seats, equipment


def mock_ingest(text: str) -> InstitutionData:
    data = InstitutionData(summary="mock-parsed institutional dump")
    section: Optional[str] = None
    current_source: str = ""
    program: str = ""
    course_pat = re.compile(r"^([A-Z]{2,5}\s*\d{3})\s+(.+?)\s*[—–-]\s*(.+)$")
    inst_pat = re.compile(r"^(.+?)\s+teaches\s+(.+)$")
    cohort_pat = re.compile(
        r"^(.+?)\s*\((?:([^,()]+),\s*)?class\s+of\s+(\d{4})\).*?term\s+(\d+).*?(\d+)\s+students", re.I)
    room_pat = re.compile(r"^(.+?)\s*[—–-]\s*(\d+)\s*seats?\s*,\s*(lecture|lab|seminar)", re.I)
    term_pat = re.compile(r"term\s+(\d+)\s*:\s*(.+)$", re.I)
    req_pat = re.compile(r"([A-Z]{2,5}\s*\d{3})\s*\(?(required|elective)\)?", re.I)
    dist_pat = re.compile(
        r"^(.+?)\s+(?:to|->|—|-)\s+(.+?)\s*[:\-]?\s*(\d+)\s*min", re.I)

    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue

        # File headers from /ingest/files: "--- 1-catalog.pdf ---"
        if line.startswith("---") and line.endswith("---"):
            current_source = line.strip("- ").strip()
            continue

        # Campus distance lines also contain ':' — handle them before headers.
        if section == "campus":
            dm = dist_pat.match(line)
            if dm:
                data.distances.append(ExtractedDistance(
                    from_building=dm.group(1).strip(),
                    to_building=dm.group(2).strip(),
                    minutes=int(dm.group(3)),
                    source=current_source or "campus map"))
                continue

        # Degree-term lines contain ':' but are data, not section headers.
        m = term_pat.match(line)
        if m and section == "degree":
            term = int(m.group(1))
            for req_m in req_pat.finditer(m.group(2)):
                data.degree_map.append(ExtractedRequirement(
                    program=program, term=term,
                    course=req_m.group(1).strip(),
                    required=req_m.group(2).lower() == "required",
                    source=current_source or "degree map"))
            continue

        if ":" in line:
            section = _current_section(line, section)
            pm = re.search(r"\((.*?)\)", line)
            if pm and section == "degree":
                program = pm.group(1).strip()
            continue

        # campus map: building names, comma-separated or one per line
        if section == "campus":
            data.buildings.extend(b.strip() for b in line.split(",") if b.strip())
            continue

        m = course_pat.match(line)
        if m and section == "course":
            code, title, rest = m.groups()
            pattern, rtype, seats, equip = _parse_course_rest(rest)
            data.courses.append(ExtractedCourse(
                code=code, title=title.strip(), pattern=pattern, room_type=rtype,
                seats=seats, equipment=equip, source=current_source or "course catalog"))
            continue
        m = inst_pat.match(line)
        if m and section == "instructor":
            name, rest = m.groups()
            availability = ""
            # "Prof. Lee teaches CS 210, CS 401 — unavailable Fridays"
            parts = re.split(r"\s*[—–]\s*|\s+-\s+", rest, maxsplit=1)
            courses = parts[0]
            if len(parts) > 1:
                availability = parts[1].strip()
            max_sections = 2
            mm = re.search(r"max\s+(\d+)", courses, re.I)
            if mm:
                max_sections = int(mm.group(1))
                courses = courses[:mm.start()]
            quals = [c.strip("() ").strip() for c in courses.split(",") if c.strip()]
            data.instructors.append(ExtractedInstructor(
                name=name.strip(), qualified_courses=quals,
                max_sections=max_sections, availability=availability,
                source=current_source or "faculty roster"))
            continue
        m = cohort_pat.match(line)
        if m and section == "cohort":
            name, program, grad, term, size = m.groups()
            data.cohorts.append(ExtractedCohort(
                name=name.strip(), program=(program or "").strip(),
                graduation_year=int(grad), admission_year=int(grad) - 4,
                current_term=int(term), size=int(size),
                source=current_source or "student bodies"))
            continue
        m = room_pat.match(line)
        if m and section == "room":
            name, cap, rtype = m.groups()
            # equipment is everything after the room type (index 1 of a "," split)
            equip = [w.strip() for w in line.split(",")[2:] if w.strip()]
            # Infer the building from the room-name prefix when the dump has a
            # campus map ("Science Hall 120" -> Science).
            building = ""
            for b in ("Science", "Engineering", "Library"):
                if name.strip().lower().startswith(b.lower()):
                    building = b
                    break
            data.rooms.append(ExtractedRoom(
                name=name.strip(), building=building, capacity=int(cap),
                room_type=rtype.lower(), equipment=equip,
                source=current_source or "facilities"))
            continue

    return data