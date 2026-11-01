"""Student-request parser: a student's life -> typed plan constraints.

The coordinator flow parses *instructor* constraints into solver operations.
This is the student mirror: "I work Tuesdays and Thursdays, I need CS 201
this term, no 8 AM classes" -> must-courses, unavailable days/periods, and
time-of-day preferences. Muse Spark does the translation (structured
output); a deterministic selector then proves a conflict-free schedule
against those constraints — the model never picks the classes itself.

Mock path: rule-based, zero credits, so dev/tests run the full flow offline.
"""

from __future__ import annotations

import logging
import re

from app import config
from app.models.results import StudentConstraints
from app.models.scenario import DAY_NAMES, PERIOD_NAMES, Scenario
from app.parsing.mock import _DAY, _mentioned_courses

logger = logging.getLogger(__name__)

_NO_TIME = re.compile(r"\b(no|not|avoid|never|hate)\b[^.]*\b(8:00|8 am|early|morning)\b", re.I)


_DONE = re.compile(r"\b(completed|passed|finished|took|taken|already have|done)\b", re.I)


def extract_course_ids(text: str, scenario: Scenario) -> list[str]:
    """Course ids/codes literally present in a study record — factual
    extraction, no model involved."""
    squashed = re.sub(r"\s+", "", text.lower())
    found = []
    for c in scenario.courses:
        if c.id.lower() in squashed or c.code.lower().replace(" ", "") in squashed:
            found.append(c.id)
    return found


def mock_student_parse(message: str, scenario: Scenario, cohort) -> StudentConstraints:  # noqa: ANN001
    lower = message.lower()
    # Courses named in a "I've completed..." clause are record, not requests.
    completed: list[str] = []
    must: list[str] = []
    for clause in re.split(r"[.,;]", message):
        ids = [c.id for c in _mentioned_courses(clause, scenario)]
        if _DONE.search(clause):
            completed.extend(i for i in ids if i not in completed)
        else:
            must.extend(i for i in ids if i not in must and i not in completed)

    # Work days: any day named in a sentence about work/job/unavailability.
    avoid_days: list[int] = []
    for sentence in re.split(r"[.;]", lower):
        if re.search(r"\b(work|job|shift|busy|unavailable)\b", sentence):
            for token, day in _DAY.items():
                if re.search(rf"\b{token}\b", sentence) and day not in avoid_days:
                    avoid_days.append(day)

    avoid_periods: list[int] = []
    if _NO_TIME.search(lower) or "no early" in lower:
        avoid_periods.append(0)
    if re.search(r"\b(evening|night)\b[^.]*\b(work|job|shift)\b", lower) or \
            re.search(r"\b(work|job|shift)\b[^.]*\b(evening|night)\b", lower):
        avoid_periods.append(3)

    target = 4
    m = re.search(r"(?<![:\d])(\d+)\s*(?:courses|classes)", lower)
    if m:
        target = max(1, min(6, int(m.group(1))))

    return StudentConstraints(
        summary="Parsed student request (offline rules).",
        must_course_ids=must,
        completed_course_ids=completed,
        avoid_days=sorted(avoid_days),
        avoid_periods=sorted(set(avoid_periods)),
        prefer_morning=bool(re.search(r"\b(prefer|love|like|rather)\b[^.]*\bmorning", lower)),
        prefer_afternoon=bool(re.search(r"\b(prefer|love|like|rather)\b[^.]*\bafternoon", lower)),
        target_courses=target,
    )


def _system_prompt(scenario: Scenario, cohort, plan: list[str], pool: list[str]) -> str:  # noqa: ANN001
    def line(cid: str) -> str:
        c = scenario.course(cid)
        return f"- {c.id} ({c.code}, {c.title})" + (" [required this term]" if cid in plan else "")
    courses = "\n".join(line(cid) for cid in pool)
    return f"""You parse a student's schedule request for ScheduleSolve AI.
The student belongs to cohort {cohort.name}. Convert their message into
typed constraints for a deterministic selector — you do NOT pick classes.

COURSES THE STUDENT MAY TAKE THIS TERM (use exact ids — never invent):
{courses}

ENCODING
- day: 0-4 = {", ".join(f"{i}={d}" for i, d in enumerate(DAY_NAMES))}
- period: 0-{len(PERIOD_NAMES)-1} = {", ".join(f"{i}={p}" for i, p in enumerate(PERIOD_NAMES))}

RULES
- must_course_ids: courses the student says they need/must take this term.
- completed_course_ids: courses the student says they have already
  completed/passed — these are their study record, never requests.
- avoid_days: days they cannot attend at all (e.g. work days).
- avoid_periods: times of day they cannot attend (e.g. "no 8 AM" -> [0],
  "I work evenings" -> [3]).
- prefer_morning / prefer_afternoon: soft time-of-day preferences only.
- target_courses: how many courses they want (default 4 = full-time).
- summary: one line restating the constraints you encoded."""


class StudentPlanParser:
    """Muse Spark student parse with a deterministic mock fallback."""

    def __init__(self) -> None:
        self.mode: str = "mock" if not config.MUSE_API_KEY else "muse-spark"
        self.model: str | None = config.MUSE_MODEL if config.MUSE_API_KEY else None
        self.last_latency_ms: int | None = None
        self._client = None
        if config.MUSE_API_KEY:
            from openai import OpenAI  # lazy: mock mode needs no SDK
            self._client = OpenAI(
                base_url=config.MUSE_BASE_URL, api_key=config.MUSE_API_KEY,
                timeout=config.MUSE_TIMEOUT_S)

    def parse(self, message: str, scenario: Scenario, cohort,  # noqa: ANN001
              plan: list[str], pool: list[str]) -> StudentConstraints:
        import time
        t0 = time.perf_counter()
        if self._client is None:
            out = mock_student_parse(message, scenario, cohort)
            self.last_latency_ms = int((time.perf_counter() - t0) * 1000)
            return self._clean(out, pool)
        try:
            kwargs = dict(
                model=config.MUSE_MODEL,
                messages=[
                    {"role": "system", "content": _system_prompt(scenario, cohort, plan, pool)},
                    {"role": "user", "content": message},
                ],
                response_format=StudentConstraints,
            )
            if config.MUSE_REASONING_EFFORT:
                kwargs["reasoning_effort"] = config.MUSE_REASONING_EFFORT
            response = self._client.beta.chat.completions.parse(**kwargs)
            parsed: StudentConstraints | None = response.choices[0].message.parsed
            if parsed is None:
                raise ValueError("model returned no parsed content")
            self.last_latency_ms = int((time.perf_counter() - t0) * 1000)
            logger.info("muse-spark student parse ok (model=%s)", config.MUSE_MODEL)
            return self._clean(parsed, pool)
        except Exception:
            logger.exception("Muse Spark student parse failed; falling back to rules")
            self.mode = "mock"
            out = mock_student_parse(message, scenario, cohort)
            self.last_latency_ms = int((time.perf_counter() - t0) * 1000)
            return self._clean(out, pool)

    @staticmethod
    def _clean(c: StudentConstraints, pool: list[str]) -> StudentConstraints:
        pool_set = set(pool)
        c.must_course_ids = [x for x in dict.fromkeys(c.must_course_ids) if x in pool_set]
        c.completed_course_ids = [x for x in dict.fromkeys(c.completed_course_ids)
                                  if x not in c.must_course_ids]
        c.avoid_days = sorted({d for d in c.avoid_days if 0 <= d <= 4})
        c.avoid_periods = sorted({p for p in c.avoid_periods if 0 <= p <= 3})
        c.target_courses = max(1, min(6, c.target_courses or 4))
        return c
