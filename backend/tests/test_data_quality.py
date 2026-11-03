"""Data-quality invariants across every scenario scale.

The solver is only as good as its input. These tests assert what a scenario
must satisfy *before* it is worth solving — unique ids, resolvable references,
sane sizes, a complete walk matrix, a contiguous time grid, and a realism audit
with zero errors — and they run against every builder, not just the seed.

If a builder starts emitting a broken institution, this fails here rather than
producing a plausible-looking timetable from nonsense.
"""

from __future__ import annotations

import pytest

from app.data.department import (
    build_department_scenario,
    build_full_university_scenario,
    build_university_scenario,
)
from app.data.realism import audit_scenario
from app.main import load_seed_scenario

BUILDERS = {
    "seed": lambda: load_seed_scenario(),
    "department": lambda: build_department_scenario(load_seed_scenario()),
    "university": lambda: build_university_scenario(load_seed_scenario()),
    "stress": lambda: build_full_university_scenario(load_seed_scenario()),
}


@pytest.fixture(scope="module", params=list(BUILDERS), ids=list(BUILDERS))
def scenario(request):
    return BUILDERS[request.param]()


def _ids(items) -> list[str]:
    return [item.id for item in items]


def test_ids_are_unique(scenario):
    for name in ("buildings", "rooms", "instructors", "courses", "sections",
                 "programs", "cohorts", "students", "phd_reservations"):
        ids = _ids(getattr(scenario, name))
        duplicates = {i for i in ids if ids.count(i) > 1}
        assert not duplicates, f"{name} has duplicate ids: {sorted(duplicates)}"

    offerings = [o.course_id for o in scenario.course_offerings]
    assert len(offerings) == len(set(offerings)), "more than one offering per course"


def test_references_resolve(scenario):
    buildings = {b.id for b in scenario.buildings}
    rooms = {r.id for r in scenario.rooms}
    courses = {c.id for c in scenario.courses}
    sections = {s.id for s in scenario.sections}
    instructors = {i.id for i in scenario.instructors}
    programs = {p.id for p in scenario.programs}
    cohorts = {c.id for c in scenario.cohorts}
    students = {s.id for s in scenario.students}

    for room in scenario.rooms:
        assert room.building_id in buildings, f"room {room.id} in unknown building"

    for section in scenario.sections:
        assert section.course_id in courses, f"section {section.id} has unknown course"

    for cohort in scenario.cohorts:
        assert cohort.program_id in programs, f"cohort {cohort.id} has unknown program"

    for program in scenario.programs:
        for term, requirements in program.roadmap.items():
            assert int(term) >= 1, f"{program.id} roadmap has term {term!r}"
            for requirement in requirements:
                assert requirement.course_id in courses, (
                    f"{program.id} term {term} references unknown course "
                    f"{requirement.course_id}"
                )

    for blackout in scenario.room_blackouts:
        assert blackout.room_id in rooms, f"blackout on unknown room {blackout.room_id}"

    for offering in scenario.course_offerings:
        assert offering.course_id in courses, f"offering for unknown course {offering.course_id}"

    for section_id, instructor_id in scenario.instructor_pins.items():
        assert section_id in sections, f"instructor pin on unknown section {section_id}"
        assert instructor_id in instructors, f"instructor pin to unknown {instructor_id}"

    for section_id, room_id in scenario.room_pins.items():
        assert section_id in sections, f"room pin on unknown section {section_id}"
        assert room_id in rooms, f"room pin to unknown room {room_id}"

    for reservation in scenario.phd_reservations:
        assert reservation.student_id in students
        assert reservation.instructor_id in instructors
        assert reservation.course_id in courses


def test_sizes_are_positive(scenario):
    assert scenario.sections, "a scenario with no sections cannot be scheduled"
    for room in scenario.rooms:
        assert room.capacity > 0, f"room {room.id} has capacity {room.capacity}"
    for course in scenario.courses:
        assert course.seats > 0, f"course {course.id} asks for {course.seats} seats"
    for cohort in scenario.cohorts:
        assert cohort.size > 0, f"cohort {cohort.id} has size {cohort.size}"
    for instructor in scenario.instructors:
        assert instructor.max_sections > 0, f"{instructor.id} has no section cap"


def test_walk_matrix_is_complete_and_symmetric(scenario):
    buildings = _ids(scenario.buildings)
    for origin in buildings:
        assert origin in scenario.distances, f"no walk row for building {origin}"
        for target in buildings:
            assert target in scenario.distances[origin], f"{origin} -> {target} missing"
            forward = scenario.distances[origin][target]
            backward = scenario.distances[target][origin]
            assert forward >= 0
            assert forward == backward, f"{origin}<->{target} is not symmetric"
        assert scenario.distances[origin][origin] == 0


def test_time_grid_is_contiguous(scenario):
    grid = scenario.time_grid
    assert grid.periods, "no periods defined"
    assert grid.periods[0].start == grid.day_start
    for earlier, later in zip(grid.periods, grid.periods[1:]):
        assert earlier.end == later.start, "gap or overlap between periods"
    for period in grid.periods:
        assert period.start < period.end
    assert grid.periods[-1].end <= grid.day_end


def test_realism_audit_reports_no_errors(scenario):
    report = audit_scenario(scenario)
    assert report.ok, "realism audit errors:\n" + "\n".join(
        f"  {issue.kind}: {issue.message}" for issue in report.errors
    )


def test_only_offered_courses_are_scheduled(scenario):
    offered = scenario.offered_sections()
    assert offered, "nothing is offered in this scenario"
    for section in offered:
        assert scenario.is_offered(section.course_id), (
            f"section {section.id} schedules a course that is not offered"
        )


def test_phd_reservations_respect_the_supervisor_cap(scenario):
    policy = scenario.policy
    approved: dict[tuple[str, str], int] = {}
    for reservation in scenario.phd_reservations:
        assert policy.phd_min_credits <= reservation.credits <= policy.phd_max_credits
        if reservation.status != "approved":
            continue
        key = (reservation.instructor_id, reservation.term)
        approved[key] = approved.get(key, 0) + 1

    by_instructor = {i.id: i for i in scenario.instructors}
    for (instructor_id, term), count in approved.items():
        instructor = by_instructor[instructor_id]
        cap = min(instructor.max_phd_students, policy.phd_max_students_per_fall)
        assert count <= cap, (
            f"{instructor_id} has {count} approved PhD students in {term}, cap {cap}"
        )
