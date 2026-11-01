"""Independent verification of a solver's timetable.

The search is never trusted about its own output. This module re-derives every
hard constraint from the scenario + placements alone, so the benchmark, the
tests and the compare view all share one auditor. A timetable that fails any
check here is not evidence of anything, no matter which engine produced it.

Checks map to the constraint catalog:
  C7  same-cohort sections never overlap
  C8  a cohort has at most two meetings on any day
  C13 instructor qualification
  C14 instructor hard unavailability
  C15 load cap / C16 prep cap
  C17 no instructor double-booking
  C18 block pattern integrity (fixed meeting pattern, C29)
  C23 no room double-booking
  C24 room capacity / C25 room type / C34 equipment
  C26 room blackouts / term closures
  C32 walk limit between back-to-back classes
"""

from __future__ import annotations

from collections import defaultdict

from app.models.results import SolveResult
from app.models.scenario import (
    BLOCK_PERIODS,
    PATTERN_DAYS,
    Scenario,
)


def placement_slots(placement) -> set[tuple[int, int]]:
    """(day, period) cells a placement occupies."""
    return {(day, period) for day in placement.days for period in placement.periods}


def verify_timetable(sc: Scenario, result: SolveResult) -> list[str]:
    """Return a list of human-readable violations (empty = valid)."""
    problems: list[str] = []
    if result.timetable is None:
        return ["no timetable returned"]

    placements = result.timetable.placements
    by_section = {}
    for p in placements:
        if p.section_id in by_section:
            problems.append(f"{p.section_id}: placed more than once")
        by_section[p.section_id] = p

    expected = {s.id for s in sc.sections}
    missing = sorted(expected - set(by_section))
    extra = sorted(set(by_section) - expected)
    if missing:
        problems.append(f"{len(missing)} sections not placed (e.g. {missing[:3]})")
    if extra:
        problems.append(f"{len(extra)} unknown sections placed (e.g. {extra[:3]})")

    # -- per-placement structural + resource checks -------------------------
    inst_load: dict[str, int] = defaultdict(int)
    inst_weight: dict[str, float] = defaultdict(float)
    inst_preps: dict[str, set[str]] = defaultdict(set)
    inst_busy: dict[tuple[str, int, int], str] = {}
    room_busy: dict[tuple[str, int, int], str] = {}

    for p in placements:
        section = next((s for s in sc.sections if s.id == p.section_id), None)
        if section is None:
            continue
        course = sc.course(section.course_id)
        instructor = next((i for i in sc.instructors if i.id == p.instructor_id), None)
        room = next((r for r in sc.rooms if r.id == p.room_id), None)
        if instructor is None:
            problems.append(f"{p.section_id}: unknown instructor {p.instructor_id}")
            continue
        if room is None:
            problems.append(f"{p.section_id}: unknown room {p.room_id}")
            continue
        if p.course_id != course.id:
            problems.append(f"{p.section_id}: course mismatch ({p.course_id} != {course.id})")

        # C29 fixed pattern integrity
        if course.pattern in ("MWF", "TTh"):
            if p.days != PATTERN_DAYS[course.pattern] or p.period is None \
                    or p.periods != [p.period]:
                problems.append(f"{p.section_id}: {course.pattern} pattern malformed")
        elif course.pattern == "block":
            if len(p.days) != 1 or p.days[0] not in (1, 2, 3) \
                    or p.period is not None or p.periods != list(BLOCK_PERIODS):
                problems.append(f"{p.section_id}: block pattern malformed")
        else:
            problems.append(f"{p.section_id}: unknown pattern {course.pattern}")

        # C13 qualification
        if course.id not in instructor.qualified_courses:
            problems.append(f"{p.section_id}: {instructor.id} not qualified for {course.code}")

        # C14 hard unavailability
        for slot in instructor.hard_unavailable:
            if slot.day in p.days and slot.period in p.periods:
                problems.append(
                    f"{p.section_id}: {instructor.id} unavailable "
                    f"day {slot.day} period {slot.period}")

        # C24/C25/C34 room fit
        enrollment = sc.enrollment_for_section(section)
        if room.room_type != course.room_type:
            problems.append(f"{p.section_id}: room type {room.room_type} != {course.room_type}")
        if room.capacity < enrollment:
            problems.append(
                f"{p.section_id}: room {room.id} capacity {room.capacity} < enrollment {enrollment}")
        if not set(course.equipment) <= set(room.equipment):
            problems.append(f"{p.section_id}: room {room.id} missing equipment")

        # C26 blackouts / closures
        for day, period in placement_slots(p):
            if any(b.room_id == room.id and b.day == day
                   and (b.period is None or b.period == period)
                   for b in sc.room_blackouts):
                problems.append(f"{p.section_id}: room {room.id} blacked out {day}/{period}")
            if any(c.day == day and (c.period is None or c.period == period)
                   for c in sc.closures):
                problems.append(f"{p.section_id}: placed on a closure {day}/{period}")

        # C15/C16 caps (checked incrementally below)
        inst_load[instructor.id] += 1
        inst_weight[instructor.id] += sc.section_load_units(section)
        inst_preps[instructor.id].add(course.id)

        # C17/C23 no double booking
        for day, period in placement_slots(p):
            key = (instructor.id, day, period)
            if key in inst_busy:
                problems.append(
                    f"{p.section_id}: instructor {instructor.id} double-booked "
                    f"with {inst_busy[key]} at {day}/{period}")
            inst_busy[key] = p.section_id
            rkey = (room.id, day, period)
            if rkey in room_busy:
                problems.append(
                    f"{p.section_id}: room {room.id} double-booked "
                    f"with {room_busy[rkey]} at {day}/{period}")
            room_busy[rkey] = p.section_id

        # pins must be honoured
        if sc.instructor_pins.get(p.section_id, instructor.id) != instructor.id:
            problems.append(f"{p.section_id}: instructor pin not honoured")
        if sc.room_pins.get(p.section_id, room.id) != room.id:
            problems.append(f"{p.section_id}: room pin not honoured")

    for iid, load in inst_load.items():
        instructor = sc.instructor(iid)
        if load > instructor.max_sections:
            problems.append(f"{iid}: load {load} > cap {instructor.max_sections}")
        if len(inst_preps[iid]) > instructor.max_preps:
            problems.append(
                f"{iid}: preps {len(inst_preps[iid])} > cap {instructor.max_preps}")
        load_cap = sc.instructor_load_cap(instructor)
        if inst_weight[iid] > load_cap + 1e-6:
            problems.append(
                f"{iid}: student-credit load {inst_weight[iid]:.2f} > "
                f"cap {load_cap:.2f}")

    # -- C7 cohort conflicts + C8 daily load --------------------------------
    slots_by_section = {sid: placement_slots(p) for sid, p in by_section.items()}
    for cohort in sc.cohorts:
        course_ids = set(sc.cohort_term_courses(cohort))
        mine = [p for p in placements if p.course_id in course_ids]
        for i, a in enumerate(mine):
            for b in mine[i + 1:]:
                if slots_by_section.get(a.section_id, set()) & slots_by_section.get(b.section_id, set()):
                    problems.append(
                        f"{cohort.id}: {a.section_id} overlaps {b.section_id} (C7)")
        per_day: dict[int, int] = defaultdict(int)
        for p in mine:
            for day in set(p.days):
                per_day[day] += 1
        for day, count in per_day.items():
            if count > 2:
                problems.append(f"{cohort.id}: {count} meetings on day {day} (C8)")

    # -- C32 walk limit ------------------------------------------------------
    building_of_room = {r.id: r.building_id for r in sc.rooms}
    for cohort in sc.cohorts:
        course_ids = set(sc.cohort_term_courses(cohort))
        mine = [p for p in placements if p.course_id in course_ids]
        for i, a in enumerate(mine):
            for b in mine[i + 1:]:
                ca = sc.course(a.course_id)
                cb = sc.course(b.course_id)
                if ca.pattern not in ("MWF", "TTh") or cb.pattern != ca.pattern:
                    continue
                if a.period is None or b.period is None or abs(a.period - b.period) != 1:
                    continue
                ba = building_of_room.get(a.room_id)
                bb = building_of_room.get(b.room_id)
                if ba is None or bb is None:
                    continue
                distance = sc.distances.get(ba, {}).get(bb)
                if distance is None:
                    problems.append(f"missing distance {ba}->{bb}")
                elif distance > sc.walk_limit_min:
                    problems.append(
                        f"{cohort.id}: {a.section_id}->{b.section_id} walk "
                        f"{distance} min > {sc.walk_limit_min} (C32)")

    return problems


def timetable_signature(result: SolveResult) -> dict[str, tuple]:
    """Comparable placement map for cross-engine agreement."""
    if result.timetable is None:
        return {}
    return {
        p.section_id: (p.instructor_id, tuple(p.days), p.period, tuple(p.periods), p.room_id)
        for p in result.timetable.placements
    }
