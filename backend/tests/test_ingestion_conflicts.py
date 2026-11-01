"""Institution-data conflicts and change reports.

The user must see both sides of a disagreement (with the source each came
from) and choose the winner; an update must say what changed or that nothing
changed.
"""

from __future__ import annotations

from app.ingestion.conflicts import detect_conflicts, diff_data
from app.models.ingestion import (
    ExtractedCohort,
    ExtractedCourse,
    ExtractedDistance,
    ExtractedInstructor,
    ExtractedRequirement,
    ExtractedRoom,
    InstitutionData,
)


def _data() -> InstitutionData:
    return InstitutionData(
        summary="two catalogs disagree",
        buildings=["Science Hall", "Engineering Hall"],
        courses=[
            ExtractedCourse(code="CS 101", title="Intro to CS", pattern="MWF",
                            seats=30, source="1-catalog.pdf"),
            ExtractedCourse(code="CS 101", title="Programming I", pattern="TTh",
                            seats=45, source="2-degree-maps.docx"),
            ExtractedCourse(code="CS 201", title="Data Structures", pattern="MWF",
                            seats=40, source="1-catalog.pdf"),
        ],
        instructors=[
            ExtractedInstructor(name="Prof. Patel", qualified_courses=["CS 101"],
                                max_sections=2, source="4-faculty.txt"),
            ExtractedInstructor(name="Prof. Lee", qualified_courses=["CS 201"],
                                max_sections=3, source="faculty-email.txt"),
        ],
        rooms=[
            ExtractedRoom(name="Science 120", building="Science Hall", capacity=120,
                          source="5-rooms.xlsx"),
            ExtractedRoom(name="Engineering 210", building="Engineering Hall", capacity=90,
                          source="room-sheet.csv"),
        ],
        cohorts=[
            ExtractedCohort(name="CS 2025", program="BSc CS", current_term=3,
                            size=40, source="3-cohorts.csv"),
            ExtractedCohort(name="BSc Data", program="BSc Data Science", current_term=1,
                            size=25, source="3-cohorts.csv"),
        ],
        degree_map=[
            ExtractedRequirement(program="BSc CS", term=1, course="CS 101",
                                 source="2-degree-maps.docx"),
            ExtractedRequirement(program="BSc CS", term=3, course="CS 499",
                                 source="2-degree-maps.docx"),
        ],
        distances=[
            ExtractedDistance(from_building="Science Hall", to_building="Engineering Hall",
                              minutes=8, source="6-campus-map.md"),
            ExtractedDistance(from_building="Engineering Hall", to_building="Science Hall",
                              minutes=12, source="campus-email.txt"),
        ],
    )


def test_conflicts_name_sources_and_offer_a_winner():
    conflicts = detect_conflicts(_data())
    kinds = {c.kind for c in conflicts}
    assert {"duplicate", "missing-course", "missing-degree-map"} <= kinds

    course = next(c for c in conflicts if c.entity == "courses")
    assert "1-catalog.pdf" in " ".join(course.sources)
    assert "2-degree-maps.docx" in " ".join(course.sources)
    assert [o.key for o in course.options] == ["keep_0", "keep_1"]
    assert course.default_option == "keep_0"

    missing = next(c for c in conflicts if c.kind == "missing-course")
    assert "CS 499" in missing.summary
    assert "2-degree-maps.docx" in " ".join(missing.sources)
    assert {o.key for o in missing.options} == {"keep_requirement", "drop_requirement"}

    cohort = next(c for c in conflicts if c.kind == "missing-degree-map")
    assert "BSc Data Science" in cohort.summary
    assert {o.key for o in cohort.options} == {"keep_cohort", "drop_cohort"}

    distance = next(c for c in conflicts if c.entity == "distances")
    assert "8 min" in " ".join(distance.sources)
    assert "12 min" in " ".join(distance.sources)


def test_change_report_says_no_change_and_names_real_changes():
    before = _data()
    same = _data()
    unchanged = diff_data(before, same)
    assert unchanged.unchanged is True
    assert "No change detected" in unchanged.summary

    after = _data()
    after.courses.append(ExtractedCourse(code="CS 301", title="Algorithms",
                                         source="1-catalog.pdf"))
    after.instructors[0].max_sections = 4
    after.rooms.pop()
    report = diff_data(before, after)
    assert report.unchanged is False
    assert "Recognized" in report.summary
    kinds = {(c.kind, c.entity) for c in report.changes}
    assert ("added", "course") in kinds
    assert ("updated", "instructor") in kinds
    assert ("removed", "room") in kinds


def test_first_import_is_reported_as_initial():
    report = diff_data(None, _data())
    assert report.initial is True
    assert "Initial import" in report.summary
