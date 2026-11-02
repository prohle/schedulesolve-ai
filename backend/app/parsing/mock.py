"""Deterministic offline parser — the mock fallback when no MODEL_API_KEY is set.

Not a model: a rule-based stand-in so the full pipeline (parse -> validate ->
solve -> self-heal -> propose) runs end-to-end without spending credits. The
real Muse Spark path lives in parser.py. Clearly labeled in every summary.
"""

from __future__ import annotations

import re

from app.models.scenario import DAY_NAMES, Operation, ParsedRequest, Scenario

_DAY = {
    "monday": 0, "mondays": 0, "mon": 0, "mons": 0,
    "tuesday": 1, "tuesdays": 1, "tues": 1, "tue": 1, "tues": 1,
    "wednesday": 2, "wednesdays": 2, "weds": 2, "wed": 2,
    "thursday": 3, "thursdays": 3, "thurs": 3, "thur": 3, "thu": 3,
    "friday": 4, "fridays": 4, "fri": 4,
}
_PERIOD = {
    "8:00": 0, "8am": 0, "8 am": 0, "morning": 0, "mornings": 0,
    "10:00": 1, "10am": 1,
    "1:00": 2, "13:00": 2, "afternoon": 2, "afternoons": 2, "1pm": 2,
    "3:00": 3, "15:00": 3, "3pm": 3,
}

_DAY_RE = r"(?:monday|mon|tuesday|tues|tue|wednesday|weds|wed|thursday|thurs|thu|friday|fri)s?"


def _mentioned_instructors(message: str, scenario: Scenario):
    lower = message.lower()
    return [i for i in scenario.instructors
            if re.search(rf"\b{re.escape(i.id)}\b", lower)
            or re.search(rf"\b{re.escape(i.name.lower().split('. ', 1)[-1])}\b", lower)]


def _mentioned_courses(message: str, scenario: Scenario):
    lower = re.sub(r"\s+", "", message.lower())  # "cs 101" -> "cs101"
    hits = []
    for c in scenario.courses:
        if c.id in lower or c.code.lower().replace(" ", "") in lower:
            hits.append(c)
    return hits


def _first_day(message: str):
    m = re.search(rf"\b({_DAY_RE})\b", message.lower())
    return _DAY[m.group(1)] if m else None


def _first_period(message: str):
    lower = message.lower()
    for token, p in _PERIOD.items():
        if re.search(rf"\b{re.escape(token)}\b", lower):
            return p
    return None


def mock_parse(message: str, scenario: Scenario,
               speaker_id: str | None = None) -> ParsedRequest:
    lower = message.lower()
    instructors = _mentioned_instructors(message, scenario)
    if not instructors and speaker_id:
        try:
            instructors = [scenario.instructor(speaker_id)]
        except StopIteration:
            pass
    courses = _mentioned_courses(message, scenario)
    ops: list[Operation] = []
    parts: list[str] = []

    # Term closure / holiday: "no classes on Friday", "campus closed Monday",
    # "Labor Day holiday — no teaching Thursday". Checked before the
    # no-entity bail and before room closures (a named building wins there).
    if not instructors and re.search(
            r"\b(?:no classes|no teaching|holiday|closed|closure|shutdown)\b", lower):
        day = _first_day(lower)
        named_room = any(r.name.lower() in lower for r in scenario.rooms) or \
            any(b.name.lower() in lower for b in scenario.buildings)
        if day is not None and not named_room:
            ops.append(Operation(op="add_term_closure", day=day,
                                 label="Holiday" if "holiday" in lower else "Closure",
                                 explanation=f"No classes on {DAY_NAMES[day]}s (term closure)."))
            return ParsedRequest(
                summary=f"Mock parse: term closure on {DAY_NAMES[day]}.", operations=ops)

    if not instructors and not courses:
        return ParsedRequest(summary="(mock parser) No recognizable instructors or courses in this message.",
                             operations=[])

    inst = instructors[0] if instructors else None

    # Term Change: "Prof. Chen will no longer teach this term" — the
    # change lasts through the end of the term (also accepts the way
    # people actually phrase it: leaving, resigning, on leave, drops out).
    if inst and re.search(
            r"(?:\bno longer\b.{0,40}\bteach\b|\bwill not teach\b|\bwon'?t teach\b"
            r"|\bis leaving\b|\bresign\w*\b|\bout\b|\baway\b|\bgone\b|\bon leave\b)", lower):
        ops.append(Operation(op="remove_instructor", instructor_id=inst.id,
                             explanation=f"{inst.name} will not teach for the rest of this term."))
        parts.append(f"remove {inst.name}")

    # "taking over CS101, MATH201 and CS201 personally"
    elif inst and courses and re.search(r"\b(?:taking over|covering|will teach|must teach)\b", lower):
        for c in courses:
            section = next((s for s in scenario.sections if s.course_id == c.id), None)
            if section:
                ops.append(Operation(op="set_section_instructor", section_id=section.id,
                                     instructor_id=inst.id,
                                     explanation=f"{inst.name} personally takes over {c.code}."))
                parts.append(f"pin {c.code} to {inst.name}")

    # hard unavailability: "can't teach Tuesdays", or an obligation that
    # makes teaching impossible that day ("I have childcare on Mondays").
    # This is a hard *candidate*: the intake evidence gate decides whether
    # it is honoured as hard or downgraded to a strong soft preference.
    elif inst and re.search(
            r"\b(?:can'?t|cannot|childcare|caregiving|medical|committee)\b", lower):
        day = _first_day(lower)
        if day is not None:
            ops.append(Operation(op="add_instructor_unavailability", instructor_id=inst.id,
                                  day=day,
                                  explanation=f"{inst.name} can't teach on {DAY_NAMES[day]}s."))
            parts.append(f"{inst.name} unavailable {DAY_NAMES[day]}")

    # prep cap: "keep me under 3 preps"
    prep = re.search(r"under\s+(\d+)\s+preps?|max(?:imum)?\s+(\d+)\s+preps?", lower)
    if inst and prep:
        value = int(prep.group(1) or prep.group(2))
        ops.append(Operation(op="set_prep_cap", instructor_id=inst.id, value=value,
                             explanation=f"{inst.name} caps prep at {value}."))
        parts.append(f"{inst.name} prep cap {value}")

    # soft preference: "would rather not teach at 8:00"
    if inst and re.search(r"\b(?:rather not|prefers?|likes?|avoid)\b", lower):
        period = _first_period(lower)
        if period is not None:
            kind = "avoid" if re.search(r"\b(?:rather not|avoid|hates?)\b", lower) else "prefer"
            ops.append(Operation(op="add_instructor_preference", instructor_id=inst.id,
                                 kind=kind, period=period, weight=6,
                                 explanation=f"{inst.name} {kind}s the {period} period."))
            parts.append(f"{inst.name} {kind}s period {period}")

    # meeting-shape preference: "a 3-hour class block works better for me"
    if inst and re.search(r"\b3[-\s]?hour\b.{0,30}\bblock\b|\bblock\b.{0,30}\bworks better\b", lower):
        ops.append(Operation(op="add_instructor_preference", instructor_id=inst.id,
                             kind="prefer", pattern="block", weight=6,
                             explanation=f"{inst.name} prefers 3-hour block meetings."))
        parts.append(f"{inst.name} prefers block pattern")

    # course preference: "CS 301 is my preference" / "I'd love CS 310"
    if inst and courses and re.search(r"\b(?:preference|prefer|love)\b", lower):
        for c in courses:
            if not any(o.course_id == c.id for o in ops):
                ops.append(Operation(op="add_instructor_preference", instructor_id=inst.id,
                                     kind="prefer", course_id=c.id, weight=6,
                                     explanation=f"{inst.name} prefers to teach {c.code}."))
                parts.append(f"{inst.name} prefers {c.code}")

    # active enrollment: "CS 350 enrollment jumped to 45 after registration ended"
    enroll = re.search(r"enrollment (?:jumped|hit|rose|climbed) to (\d+)", lower)
    if enroll and courses:
        section = next((s for s in scenario.sections if s.course_id == courses[0].id), None)
        if section:
            ops.append(Operation(op="update_enrollment", section_id=section.id,
                                 value=int(enroll.group(1)),
                                 explanation=f"Active enrollment for {courses[0].code} is now {enroll.group(1)}."))
            parts.append(f"{courses[0].code} enrollment -> {enroll.group(1)}")

    # room closures: "the Science Hall is closed" (match full names, never ids)
    if re.search(r"\bclos(?:ed|e|ing)\b", lower):
        for r in scenario.rooms:
            building = next((b for b in scenario.buildings if b.id == r.building_id), None)
            bname = building.name.lower() if building else ""
            if r.name.lower() in lower or (bname and bname in lower):
                ops.append(Operation(op="add_room_unavailability", room_id=r.id,
                                     explanation=f"{r.name} closed all week."))
                parts.append(f"close {r.name}")

    if not ops:
        return ParsedRequest(summary="(mock parser) Message recognized but no operations extracted.",
                             operations=[])

    return ParsedRequest(summary="Mock parse: " + "; ".join(parts) + ".", operations=ops)
