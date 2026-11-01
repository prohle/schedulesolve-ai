"""Student advising: record/progress -> degree-map audit -> proven plan.

Mock mode throughout (zero credits). Seed facts used below: the BSc CS
roadmap is cs101 (term 1) -> cs201/math201 (term 3) -> cs210/cs301 +
elective cs350 (term 5) -> cs310/cs401 (term 7): 7 mandatory + 1 optional.
CS 2025 sits at term 3, so a progress lookup credits it with CS 101 only.
"""

from __future__ import annotations

from app.main import load_seed_scenario
from app.parsing.student import mock_student_parse
from app.services.student_plan import suggest_student_plan

MSG = "I work Tuesdays and Thursdays. I need CS 201 this term, and no 8:00 classes."
MSG_FITS = "I work Tuesdays and Thursdays. I need CS 201 this term."


def test_mock_student_parse_extracts_life_constraints():
    sc = load_seed_scenario()
    cohort = next(c for c in sc.cohorts if c.id == "cs2025")
    c = mock_student_parse(MSG, sc, cohort)
    assert c.must_course_ids == ["cs201"]
    assert c.avoid_days == [1, 3]          # Tue / Thu work days
    assert c.avoid_periods == [0]          # no 8:00
    assert c.target_courses == 4


def test_progress_lookup_from_cohort():
    sc = load_seed_scenario()
    resp = suggest_student_plan(sc, "cs2025", MSG_FITS)
    p = resp.progress
    assert p.source.startswith("progress lookup")
    assert p.completed_course_ids == ["cs101"]       # term 1, before term 3
    assert p.required_completed == 1 and p.required_total == 7
    assert p.optional_remaining == 1                 # CS 350 elective
    assert p.mandatory_ready == ["CS 201", "MATH 201"]
    assert "CS 301" in p.mandatory_co_ready          # co-take with CS 201/MATH 201
    assert "CS 310" in p.mandatory_locked            # depth-7 chain still closed


def test_suggestion_is_conflict_free_and_respects_availability():
    sc = load_seed_scenario()
    resp = suggest_student_plan(sc, "cs2025", MSG_FITS)
    assert resp.parser_mode == "mock"
    codes = [c.course_code for c in resp.courses]
    # Both mandatory-ready courses, plus CS 301 co-enrolled with its gating
    # courses (Tue/Thu work rules out the Thursday-block CS 210).
    assert set(codes) == {"CS 201", "MATH 201", "CS 301"}
    assert all(c.required for c in resp.courses)     # all mandatory picks
    for course in resp.courses:
        assert not ({1, 3} & set(course.days)), course
    cells = [{(d, course.period) for d in course.days} for course in resp.courses]
    for i, a in enumerate(cells):
        for b in cells[i + 1:]:
            assert not (a & b)
    steps = [s.step for s in resp.agent_trace]
    assert steps == ["parse", "progress", "select", "verify", "projection", "audit"]


def test_study_record_unlocks_next_sequence():
    sc = load_seed_scenario()
    resp = suggest_student_plan(
        sc, "cs2025", "I need CS 301 this term.",
        study_record="Completed courses: CS 101, CS 201, MATH 201.")
    assert resp.progress.source == "study record you provided"
    assert resp.progress.required_completed == 3
    codes = [c.course_code for c in resp.courses]
    assert "CS 301" in codes                          # depth-5 now unlocked
    assert "CS 201" not in codes                      # already on the record


def test_must_course_co_enrolled_with_its_gating_courses():
    sc = load_seed_scenario()
    resp = suggest_student_plan(sc, "cs2025", "I need CS 301 this term.")
    codes = [c.course_code for c in resp.courses]
    # CS 301 is not completed-first eligible, but its gating courses are
    # takeable now, so the plan co-enrolls them rather than refusing.
    assert "CS 301" in codes and "CS 201" in codes and "MATH 201" in codes


def test_must_course_locked_by_unfinished_prerequisites():
    sc = load_seed_scenario()
    resp = suggest_student_plan(sc, "cs2025", "I need CS 310 this term.")
    assert all(c.course_code != "CS 310" for c in resp.courses)
    assert any("CS 310 is still locked" in n for n in resp.notes)


def test_completed_named_in_message_counts_as_record():
    sc = load_seed_scenario()
    resp = suggest_student_plan(
        sc, None, "I've passed CS 101 and CS 201. What should I take?",
        program_id="bscs")
    assert resp.progress.required_completed == 2
    codes = [c.course_code for c in resp.courses]
    assert "MATH 201" in codes and "CS 201" not in codes


def test_suggestion_explains_must_course_blocked_by_availability():
    # Seed truth: CS 201's only section is MWF 8:00 — "no 8:00" blocks it,
    # and the answer must say so instead of silently dropping the course.
    sc = load_seed_scenario()
    resp = suggest_student_plan(sc, "cs2025", MSG)
    assert all(c.course_code != "CS 201" for c in resp.courses)
    assert any("CS 201 has no section outside your unavailable times" in n
               for n in resp.notes)


def test_suggestion_flags_impossible_availability():
    sc = load_seed_scenario()
    resp = suggest_student_plan(
        sc, "cs2025",
        "I work Mondays, Tuesdays, Wednesdays, Thursdays and Fridays. I need CS 201.")
    assert resp.courses == []
    assert resp.target_met is False


def test_projection_is_on_track_for_an_on_time_cohort():
    sc = load_seed_scenario()
    resp = suggest_student_plan(sc, "cs2025", MSG_FITS)
    assert resp.projection_status == "on_track"
    assert resp.graduation_delay_terms == 0
    assert "On track for Spring 2029" in resp.projection_note
    assert resp.projected_graduation
    assert resp.expected_graduation == "Spring 2029"
    # The projection is visible on the progress object too.
    assert resp.progress is not None
    assert resp.progress.projection_status == "on_track"
    assert resp.progress.projected_graduation == resp.projected_graduation


def test_projection_names_the_course_that_delays_a_senior():
    sc = load_seed_scenario()
    # CS 2023 is in term 7 but has only CS 101 on record; the 8:00 block
    # keeps CS 201 out of this term's verified plan, so the mandatory chain
    # cannot finish by the expected Spring 2027.
    resp = suggest_student_plan(
        sc, "cs2023", "I need CS 401 this term, and no 8:00 classes.",
        study_record="Completed: CS 101")
    assert resp.projection_status == "delayed"
    assert resp.graduation_delay_terms >= 1
    assert "CS 401 pushes graduation" in resp.projection_note
    assert resp.projection_course == "CS 401"
    assert resp.projected_graduation != resp.expected_graduation


def test_projection_reports_complete_when_mandatory_chain_is_done():
    sc = load_seed_scenario()
    resp = suggest_student_plan(
        sc, "cs2025", "What should I take next?",
        study_record="Completed: CS 101, CS 201, MATH 201, CS 210, CS 301, CS 310, CS 401")
    assert resp.projection_status == "complete"
    assert "All mandatory courses complete" in resp.projection_note
    assert resp.graduation_delay_terms == 0


def test_missing_inputs_name_the_record_the_projection_needs():
    sc = load_seed_scenario()
    # Cohort lookup only: the projection is an estimate, and the response says
    # which input would make it exact.
    resp = suggest_student_plan(sc, "cs2025", MSG_FITS)
    assert any("individual study record" in item for item in resp.missing_inputs)
    # Supplying the record removes that missing-input warning.
    resp = suggest_student_plan(
        sc, "cs2025", MSG_FITS,
        study_record="Completed: CS 101, CS 201")
    assert not any("individual study record" in item for item in resp.missing_inputs)


def test_contradictory_record_and_lookup_let_the_student_choose():
    sc = load_seed_scenario()
    message = "I need CS 301 this term."
    record = "Completed: CS 101, CS 201"
    # The record says CS 201 is done; the cohort lookup (term 3) credits only
    # CS 101. Both sides are surfaced instead of one silently winning.
    resp = suggest_student_plan(sc, "cs2025", message, study_record=record)
    conflict = next(c for c in resp.conflicts if c.kind == "record_vs_lookup")
    assert conflict.options == ["record", "lookup"]
    assert conflict.chosen_option == "record"          # documented default
    assert resp.progress.required_completed == 2       # record wins
    assert "CS 201" in conflict.detail

    # The student can instead let the cohort lookup win.
    resp = suggest_student_plan(
        sc, "cs2025", message, study_record=record,
        resolutions={"record_vs_lookup": "lookup"})
    conflict = next(c for c in resp.conflicts if c.kind == "record_vs_lookup")
    assert conflict.chosen_option == "lookup"
    assert resp.progress.required_completed == 1
    assert resp.progress.source.startswith("progress lookup")
    assert "you chose the cohort lookup" in resp.progress.source


def test_must_course_vs_availability_lets_the_student_choose():
    sc = load_seed_scenario()
    # Default: availability wins, CS 201 is not suggested and the clash is named.
    resp = suggest_student_plan(sc, "cs2025", MSG)
    assert all(c.course_code != "CS 201" for c in resp.courses)
    conflict = next(c for c in resp.conflicts if c.kind == "must_vs_availability")
    assert conflict.options == ["availability", "course"]
    assert conflict.chosen_option == "availability"

    # The student can choose the course instead; it is then included with a
    # plain warning and the verification step knows the exception was chosen.
    resp = suggest_student_plan(
        sc, "cs2025", MSG,
        resolutions={"must_vs_availability": "course"})
    assert any(c.course_code == "CS 201" for c in resp.courses)
    assert any("You chose CS 201 over your stated availability" in n
               for n in resp.notes)
    conflict = next(c for c in resp.conflicts if c.kind == "must_vs_availability")
    assert conflict.chosen_option == "course"
    assert resp.agent_trace[-2].step == "projection"  # plan survived verification


def test_must_course_already_completed_lets_the_student_retake():
    sc = load_seed_scenario()
    record = "Completed: CS 101, CS 201"
    resp = suggest_student_plan(
        sc, "cs2025", "I need CS 201 this term.", study_record=record)
    conflict = next(c for c in resp.conflicts if c.kind == "must_already_completed")
    assert conflict.chosen_option == "completed"
    assert all(c.course_code != "CS 201" for c in resp.courses)

    resp = suggest_student_plan(
        sc, "cs2025", "I need CS 201 this term.", study_record=record,
        resolutions={"must_already_completed": "retake"})
    assert any(c.course_code == "CS 201" for c in resp.courses)
    conflict = next(c for c in resp.conflicts if c.kind == "must_already_completed")
    assert conflict.chosen_option == "retake"


def test_student_plan_api(client):
    r = client.post("/student/plan", json={"cohort_id": "cs2025", "message": MSG_FITS})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["progress"]["completed_course_ids"] == ["cs101"]
    assert any(c["course_code"] == "CS 201" for c in body["courses"])
    r = client.post("/student/plan", json={
        "message": "advise me", "study_record": "CS 101 CS 201 MATH 201",
        "program_id": "bscs"})
    assert r.status_code == 200, r.text
    assert r.json()["progress"]["required_completed"] == 3
    r = client.post("/student/plan", json={"cohort_id": "nope", "message": "hi"})
    assert r.status_code == 400
    r = client.post("/student/plan", json={"message": "hi"})
    assert r.status_code == 400  # no cohort, no degree: cannot advise
