"""The solver must honour every fact the University tabs expose.

This is the audit behind the Facility / People / Degree Map / Catalog /
Holidays / Constraints screens: capacity, room type, equipment, blackouts,
closures, qualifications, load/prep caps, hard unavailability, cohort
conflicts, walk limits — and building utilization recomputed per term.
"""

from __future__ import annotations

from itertools import combinations

from app.data.department import build_comprehensive_scenario
from app.intelligence.matrices import compute_utilization
from app.main import load_seed_scenario
from app.services.term import simulate_intake, window_state
from app.solver.scheduling_model import solve


def _overlaps(a, b) -> bool:
    if not set(a.days) & set(b.days):
        return False
    ap = a.periods or ([a.period] if a.period is not None else [])
    bp = b.periods or ([b.period] if b.period is not None else [])
    return bool(set(ap) & set(bp))


def assert_solver_honours_facts(sc, result) -> None:
    assert result.status in ("optimal", "feasible"), result.status
    assert result.timetable is not None
    placements = result.timetable.placements
    assert len(placements) == len(sc.sections)

    for p in placements:
        course = sc.course(p.course_id)
        room = sc.room(p.room_id)
        section = sc.section_by_id(p.section_id)
        instructor = sc.instructor(p.instructor_id)

        # C24 capacity, C25 room type, C34 equipment.
        assert room.capacity >= sc.enrollment_for_section(section)
        assert room.room_type == course.room_type
        assert set(course.equipment) <= set(room.equipment)

        # C26 room blackouts and campus closures.
        periods = p.periods or ([p.period] if p.period is not None else [])
        for day in p.days:
            for period in periods:
                assert not any(
                    b.room_id == room.id
                    and b.day == day
                    and (b.period is None or b.period == period)
                    for b in sc.room_blackouts
                ), f"{p.section_id} placed in blacked-out {room.id}"
                assert not any(
                    c.day == day and (c.period is None or c.period == period)
                    for c in sc.closures
                ), f"{p.section_id} placed on a closure"

        # People: qualification + hard unavailability.
        assert p.course_id in instructor.qualified_courses
        for slot in instructor.hard_unavailable:
            assert not (
                slot.day in p.days
                and (slot.period is None or slot.period in periods)
            ), f"{p.section_id} violates {instructor.id}'s blackout"

    # C15 load caps, C16 prep caps.
    for instructor in sc.instructors:
        mine = [p for p in placements if p.instructor_id == instructor.id]
        assert len(mine) <= instructor.max_sections
        assert len({p.course_id for p in mine}) <= instructor.max_preps

    # C7 same-cohort sections never overlap.
    for cohort in sc.cohorts:
        course_ids = set(sc.cohort_term_courses(cohort))
        mine = [p for p in placements if p.course_id in course_ids]
        for a, b in combinations(mine, 2):
            assert not _overlaps(a, b), f"{cohort.id}: {a.section_id} overlaps {b.section_id}"

    # C32 walk limit between consecutive classes in the same building chain.
    # The solver constrains the same-pattern, adjacent-period case.
    for cohort in sc.cohorts:
        course_ids = set(sc.cohort_term_courses(cohort))
        mine = [p for p in placements if p.course_id in course_ids]
        for a, b in combinations(mine, 2):
            ca, cb = sc.course(a.course_id), sc.course(b.course_id)
            if ca.pattern not in ("MWF", "TTh") or cb.pattern != ca.pattern:
                continue
            if a.period is None or b.period is None:
                continue
            if abs(a.period - b.period) != 1:
                continue
            distance = sc.distances.get(a.building_id, {}).get(b.building_id, 0)
            assert distance <= sc.walk_limit_min


def test_solver_honours_every_university_fact_on_the_seed():
    sc = load_seed_scenario()
    assert_solver_honours_facts(sc, solve(sc))


def test_solver_honours_every_university_fact_on_the_full_institution():
    sc = build_comprehensive_scenario(load_seed_scenario())
    assert_solver_honours_facts(sc, solve(sc))


def test_building_utilization_is_recomputed_per_term():
    sc = load_seed_scenario()
    first = solve(sc)
    first_report = compute_utilization(sc, first.timetable)
    first_by_building = {}
    for room in sc.rooms:
        first_by_building.setdefault(room.building_id, 0)
        first_by_building[room.building_id] += next(
            (r.peak_seats for r in first_report.rooms if r.room_id == room.id), 0
        )

    # Next term: enrollment changes, so utilization must change.
    next_term = sc.model_copy(deep=True)
    next_term.active_enrollment["sec-cs101"] = 100
    second = solve(next_term)
    second_report = compute_utilization(next_term, second.timetable)
    second_by_building = {}
    for room in next_term.rooms:
        second_by_building.setdefault(room.building_id, 0)
        second_by_building[room.building_id] += next(
            (r.peak_seats for r in second_report.rooms if r.room_id == room.id), 0
        )

    assert first_report.room_utilization != second_report.room_utilization
    assert first_by_building != second_by_building


def test_simulated_intake_fills_every_professor_and_solves():
    sc = load_seed_scenario()
    updated, summary = simulate_intake(sc, accept=True, only_missing=False)
    assert summary["accepted"] == len(sc.instructors)
    state = window_state(updated)
    assert state["submitted_count"] == len(sc.instructors)
    assert state["status"] == "accepted"
    assert_solver_honours_facts(updated, solve(updated))


def test_building_balance_objective_is_feasible_and_valid():
    sc = load_seed_scenario()
    result = solve(sc, objective="building_balance")
    assert result.objective_name == "building_balance"
    assert result.status in ("optimal", "feasible")
    assert_solver_honours_facts(sc, result)
