"""Coordinator policy, catalog decisions, PhD reservations and calendar rules."""

from __future__ import annotations

import pytest

from app.data.department import build_comprehensive_scenario
from app.intelligence.load import instructor_loads, suggest_load_policy
from app.main import load_seed_scenario
from app.models.scenario import (
    AcademicPolicy,
    MeetingPattern,
    Student,
    TimeGrid,
    TimePeriod,
)
from app.services.calendar_policy import national_holidays, suggest_term_dates
from app.services.offerings import (
    add_special_topic,
    offering_summary,
    remove_special_topic,
    set_offering,
)
from app.services.phd import (
    decide_reservation,
    phd_capacity,
    request_reservation,
)
from app.services.student_plan import suggest_student_plan
from app.solver.scheduling_model import solve


def test_student_load_is_sublinear_and_suggested_from_intent():
    policy = AcademicPolicy()
    at_40 = policy.section_load_units(40, 3)
    at_80 = policy.section_load_units(80, 3)
    at_160 = policy.section_load_units(160, 3)
    assert at_40 == pytest.approx(3.0)
    assert at_80 == pytest.approx(4.88, abs=0.05)
    assert at_160 == pytest.approx(7.93, abs=0.1)
    assert at_80 < 2 * at_40  # 80 students are not two independent classes

    suggestion = suggest_load_policy(1.6)
    assert 0.5 < suggestion["load_exponent"] < 0.8
    assert suggestion["examples_relative_to_40"]["80"] == pytest.approx(1.60, abs=0.02)


def test_instructor_load_report_matches_a_real_solve():
    scenario = load_seed_scenario()
    result = solve(scenario)
    report = instructor_loads(scenario, result.timetable)
    assert report.total_sections == len(scenario.sections)
    assert not report.overloaded
    assert all(row.students > 0 for row in report.instructors if row.sections)


def test_catalog_not_offered_dormant_and_special_topics_are_recorded():
    scenario = load_seed_scenario()
    course_id = "cs350"
    set_offering(scenario, course_id, "not_offered",
                 reason="Faculty unavailable", recorded_by="coordinator")
    assert not scenario.sections_of_course(course_id)
    assert scenario.offering(course_id).status == "not_offered"
    summary = offering_summary(scenario)
    assert summary["counts"]["not_offered"] == 1

    set_offering(scenario, course_id, "offered", reason="Restored")
    assert scenario.sections_of_course(course_id)
    assert scenario.offering(course_id).status == "offered"

    scenario, topic = add_special_topic(
        scenario, code="CS 490", title="Special Topics: Verification",
        department="CS", instructor_id="chen", credits=2,
        pattern="TTh", room_type="seminar", seats=15,
        reason="One-off seminar", recorded_by="coordinator")
    assert topic.is_special_topic and topic.credits == 2
    assert scenario.sections_of_course(topic.id)
    assert scenario.is_offered(topic.id)
    assert offering_summary(scenario)["counts"]["special_topic"] == 1

    scenario = remove_special_topic(scenario, topic.id, recorded_by="coordinator")
    assert not scenario.sections_of_course(topic.id)
    assert all(c.id != topic.id for c in scenario.courses)


def test_phd_reservations_are_fall_only_credit_bounded_and_capped():
    scenario = build_comprehensive_scenario(load_seed_scenario())
    student = next(s for s in scenario.students if s.level == "phd")
    instructor_id = "grad-nsc-f0"
    course_id = "phd-nsc-700"

    # A bachelor's student is not eligible.
    with pytest.raises(ValueError):
        request_reservation(scenario, student_id="does-not-exist",
                            instructor_id=instructor_id, course_id=course_id,
                            credits=2, term="2026-fall")

    # Credits outside 1-3 are rejected.
    with pytest.raises(ValueError):
        request_reservation(scenario, student_id=student.id,
                            instructor_id=instructor_id, course_id=course_id,
                            credits=4, term="2026-fall")

    # Spring entry is rejected.
    with pytest.raises(ValueError):
        request_reservation(scenario, student_id=student.id,
                            instructor_id=instructor_id, course_id=course_id,
                            credits=2, term="2026-spring")

    # One is already approved in the shipped data; fill the cap (3) then fail.
    cap = phd_capacity(scenario, instructor_id, "2026-fall")
    assert cap["approved"] == 1 and cap["cap"] == 3
    phd_students = [s for s in scenario.students
                    if s.cohort_id and "nsc" in s.cohort_id]
    for candidate in phd_students[1:3]:
        scenario, reservation = request_reservation(
            scenario, student_id=candidate.id, instructor_id=instructor_id,
            course_id=course_id, credits=2, term="2026-fall")
        scenario, reservation = decide_reservation(
            scenario, reservation.id, approve=True)
        assert reservation.status == "approved"
    assert phd_capacity(scenario, instructor_id, "2026-fall")["remaining"] == 0
    with pytest.raises(ValueError):
        request_reservation(scenario, student_id=phd_students[3].id,
                            instructor_id=instructor_id, course_id=course_id,
                            credits=2, term="2026-fall")


def test_calendar_suggestions_include_national_holidays_and_swaps():
    holidays = national_holidays(2026, "US")
    labels = {h["label"] for h in holidays}
    assert {"Labor Day", "Thanksgiving", "Christmas Day"} <= labels
    fall = suggest_term_dates(2026, "fall", weeks=15)
    assert fall["start_date"] < fall["end_date"]
    assert any(h["label"] == "Labor Day" for h in holidays)
    assert any(h["label"] == "Thanksgiving" for h in fall["national_holidays"])
    assert fall["suggested_swaps"]
    assert fall["suggested_swaps"][0]["follows"] == 1


def test_time_grid_is_configurable_without_code_changes():
    grid = TimeGrid(
        day_start="08:30", day_end="21:00",
        periods=[
            TimePeriod(start="08:30", end="09:20", minutes=50),
            TimePeriod(start="09:30", end="10:20", minutes=50),
            TimePeriod(start="10:30", end="11:20", minutes=50),
        ],
        patterns=[
            MeetingPattern(name="MWF", days=[0, 2, 4], duration_hours=0.83),
            MeetingPattern(name="TTh", days=[1, 3], duration_hours=0.83),
            MeetingPattern(name="block", kind="block", days=[1, 2, 3],
                           periods=[2], duration_hours=1.5),
        ],
        allowed_durations_min=[50, 80, 170],
    )
    scenario = load_seed_scenario()
    scenario.time_grid = grid
    assert scenario.time_grid.period_count == 3
    assert scenario.pattern_slots("MWF", 1) == {(0, 1), (2, 1), (4, 1)}
    assert scenario.pattern_slots("block", 2) == {(2, 2)}


def test_student_plan_reports_credits_full_time_and_projection():
    scenario = load_seed_scenario()
    scenario.students.append(Student(
        id="student-1", name="Test Student", level="bachelor",
        program_id="bscs", cohort_id="cs2025", entry_year=2025,
        credits_completed=24, completed_course_ids=["cs101"],
        preferred_days=[0, 2, 4], campus_days=[0, 2, 4]))
    response = suggest_student_plan(
        scenario, student_id="student-1",
        message="I need CS 201 and I can only come Monday/Wednesday/Friday.",
        target_credits=12)
    assert response.projected_graduation
    assert response.credits_selected >= 0
    assert response.full_time == scenario.policy.is_full_time(
        len(response.courses), response.credits_selected)
    assert all(course.credits >= 1 for course in response.courses)
