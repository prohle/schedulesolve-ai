"""Department-scale scenario: the story seed grown to a real department.

The seed scenario (6 instructors, 8 sections) is the rehearsed demo story.
This module deterministically expands it — same core faculty, courses, and
cohorts, plus Mathematics and Data Science wings sharing the campus — into
the scale a real term actually has:

  26 instructors · 25 courses/sections · 16 rooms · 4 buildings
  3 degree programs · 12 cohorts

It exists so judges can verify the engine at department scale in one click
(`POST /scenario/department`) and so `scripts/benchmark.py` can quote real
solve numbers. The core wing is untouched: every demo beat (Patel, Chen,
Diaz, Okafor, Nguyen) behaves exactly as it does on the seed. The only core
patch is two course preferences for Prof. Chen, which keep her on CS 301 /
CS 310 — the sections the term-change beat re-homes — at the larger scale.
"""

from __future__ import annotations

import math

from app.models.scenario import (
    PATTERN_DAYS,
    Building,
    Cohort,
    Course,
    Instructor,
    InstructorPreference,
    PhDReservation,
    Program,
    RoadmapRequirement,
    Room,
    Scenario,
    Section,
    SlotRef,
    Student,
)


def _req(course_id: str, required: bool = True, seat_estimate: int | None = None):
    return RoadmapRequirement(course_id=course_id, required=required,
                              seat_estimate=seat_estimate)


def _clone(items):
    """Deep-copy module-level fixtures before a scenario mutates them.

    The builders used to share `_NEW_COURSES`/`_NEW_PROGRAMS` objects by
    reference, so opening the comprehensive institution silently edited the
    department tier's degree maps for every later build. Scenarios are
    independent; fixtures are immutable.
    """
    return [item.model_copy(deep=True) for item in items]


_NEW_ROOMS = [
    Room(id="s-201", name="Science 201", building_id="S", capacity=45,
         room_type="lecture", equipment=["projector", "whiteboard"]),
    Room(id="s-hall60", name="Science Hall 60", building_id="S", capacity=60,
         room_type="lecture", equipment=["projector", "mic", "lecture-capture"]),
    Room(id="e-101", name="Engineering 101", building_id="E", capacity=40,
         room_type="lecture", equipment=["projector", "whiteboard"]),
    Room(id="e-305", name="Engineering 305", building_id="E", capacity=35,
         room_type="lecture", equipment=["projector", "lecture-capture"]),
    Room(id="e-lab1", name="Engineering Lab 1", building_id="E", capacity=30,
         room_type="lab", equipment=["computers"]),
    Room(id="l-105", name="Library 105", building_id="L", capacity=40,
         room_type="lecture", equipment=["projector", "whiteboard"]),
    Room(id="l-201", name="Library 201", building_id="L", capacity=35,
         room_type="seminar", equipment=["video-conf", "whiteboard"]),
    Room(id="a-101", name="Arts 101", building_id="A", capacity=50,
         room_type="lecture", equipment=["projector", "mic"]),
    Room(id="a-210", name="Arts 210", building_id="A", capacity=30,
         room_type="seminar", equipment=["video-conf", "whiteboard"]),
]

_NEW_COURSES = [
    # Mathematics wing
    Course(id="math101", code="MATH 101", title="Calculus I", pattern="MWF",
           room_type="lecture", seats=28, equipment=["projector"]),
    Course(id="math230", code="MATH 230", title="Discrete Mathematics", pattern="MWF",
           room_type="lecture", seats=54, equipment=["projector"]),
    Course(id="math210", code="MATH 210", title="Linear Algebra", pattern="TTh",
           room_type="lecture", seats=26, equipment=["projector"]),
    Course(id="stat201", code="STAT 201", title="Statistical Methods", pattern="MWF",
           room_type="lecture", seats=50, equipment=["projector"]),
    Course(id="math301", code="MATH 301", title="Real Analysis", pattern="MWF",
           room_type="lecture", seats=24, equipment=["whiteboard"]),
    Course(id="math310", code="MATH 310", title="Probability", pattern="TTh",
           room_type="lecture", seats=24, equipment=["projector"]),
    Course(id="math320", code="MATH 320", title="Abstract Algebra", pattern="TTh",
           room_type="lecture", seats=12, equipment=["whiteboard"]),
    Course(id="math401", code="MATH 401", title="Topology", pattern="MWF",
           room_type="lecture", seats=22, equipment=["whiteboard"]),
    Course(id="math410", code="MATH 410", title="Senior Seminar", pattern="TTh",
           room_type="seminar", seats=22, equipment=["video-conf"]),
    # Data Science wing (shares MATH 230 / STAT 201 with Mathematics)
    Course(id="ds101", code="DS 101", title="Data Science Foundations", pattern="MWF",
           room_type="lecture", seats=26, equipment=["projector"]),
    Course(id="ds210", code="DS 210", title="Data Wrangling Lab", pattern="block",
           room_type="lab", seats=24, equipment=["computers"], duration=3.0),
    Course(id="stat310", code="STAT 310", title="Statistical Inference", pattern="TTh",
           room_type="lecture", seats=22, equipment=["projector"]),
    Course(id="ds320", code="DS 320", title="Data Visualization", pattern="TTh",
           room_type="lecture", seats=22, equipment=["projector"]),
    Course(id="ds410", code="DS 410", title="Data Ethics & Society", pattern="MWF",
           room_type="seminar", seats=20, equipment=["video-conf"]),
    # CS electives opened on the existing degree map
    Course(id="cs280", code="CS 280", title="Software Engineering Studio", pattern="block",
           room_type="lab", seats=14, equipment=["computers"], duration=3.0),
    Course(id="cs330", code="CS 330", title="Databases", pattern="TTh",
           room_type="lecture", seats=16, equipment=["projector"]),
    Course(id="cs420", code="CS 420", title="Advanced Machine Learning", pattern="TTh",
           room_type="lecture", seats=26, equipment=["lecture-capture"]),
]

_NEW_INSTRUCTORS = [
    Instructor(id="ahern", name="Prof. Ahern", qualified_courses=["math101", "math230"],
               max_sections=2, max_preps=2,
               hard_unavailable=[SlotRef(day=0, period=0)]),
    Instructor(id="brooks", name="Prof. Brooks", qualified_courses=["math101", "math210"],
               max_sections=2, max_preps=2),
    Instructor(id="costa", name="Prof. Costa", qualified_courses=["math230", "math210"],
               max_sections=2, max_preps=2),
    Instructor(id="dubois", name="Prof. Dubois", qualified_courses=["stat201", "math310"],
               max_sections=2, max_preps=2,
               preferences=[InstructorPreference(kind="avoid", day=4, weight=8)]),
    Instructor(id="ellis", name="Prof. Ellis", qualified_courses=["math301", "math320"],
               max_sections=2, max_preps=2),
    Instructor(id="farrell", name="Prof. Farrell", qualified_courses=["math301", "math401"],
               max_sections=2, max_preps=2),
    Instructor(id="gupta", name="Prof. Gupta", qualified_courses=["stat201", "stat310"],
               max_sections=2, max_preps=2),
    Instructor(id="hassan", name="Prof. Hassan",
               qualified_courses=["math310", "math320", "math401"],
               max_sections=2, max_preps=2),
    Instructor(id="iyer", name="Prof. Iyer", qualified_courses=["ds101", "ds320"],
               max_sections=2, max_preps=2,
               preferences=[InstructorPreference(kind="prefer", period=1, weight=6)]),
    Instructor(id="jensen", name="Prof. Jensen", qualified_courses=["ds210", "ds101"],
               max_sections=2, max_preps=2),
    Instructor(id="kim", name="Prof. Kim", qualified_courses=["stat310", "ds320"],
               max_sections=2, max_preps=2,
               hard_unavailable=[SlotRef(day=3, period=0)]),
    Instructor(id="lopez", name="Prof. Lopez", qualified_courses=["ds410", "cs420"],
               max_sections=2, max_preps=2),
    Instructor(id="mensah", name="Prof. Mensah", qualified_courses=["ds210", "cs280"],
               max_sections=2, max_preps=2),
    Instructor(id="novak", name="Prof. Novak", qualified_courses=["ds410", "math410"],
               max_sections=2, max_preps=2),
    Instructor(id="osman", name="Prof. Osman", qualified_courses=["cs280", "cs330"],
               max_sections=2, max_preps=2,
               preferences=[InstructorPreference(kind="prefer", course_id="cs330", weight=6)]),
    Instructor(id="park", name="Prof. Park", qualified_courses=["cs330", "cs420"],
               max_sections=2, max_preps=2),
    Instructor(id="quinn", name="Prof. Quinn", qualified_courses=["cs330", "ds320"],
               max_sections=2, max_preps=2),
    Instructor(id="rossi", name="Prof. Rossi", qualified_courses=["cs420", "ds101"],
               max_sections=2, max_preps=2),
    Instructor(id="singh", name="Prof. Singh", qualified_courses=["cs280", "ds210", "cs210"],
               max_sections=2, max_preps=2),
    Instructor(id="turner", name="Prof. Turner", qualified_courses=["math401", "math410"],
               max_sections=2, max_preps=2),
]

_NEW_PROGRAMS = [
    Program(id="bsmath", name="BSc Mathematics", roadmap={
        "1": [_req("math101"), _req("math230")],
        "3": [_req("math210"), _req("stat201")],
        "5": [_req("math301"), _req("math310"),
              _req("math320", required=False, seat_estimate=12)],
        "7": [_req("math401"), _req("math410")],
    }),
    Program(id="bsds", name="BSc Data Science", roadmap={
        "1": [_req("ds101"), _req("math230")],
        "3": [_req("ds210"), _req("stat201")],
        "5": [_req("stat310"), _req("ds320")],
        "7": [_req("ds410"), _req("cs420", required=False, seat_estimate=12)],
    }),
]

# Electives opened on the existing CS degree map (checked against C7/C8:
# never a third same-day meeting for any cohort).
_CS_ELECTIVES = {
    "3": [_req("cs280", required=False, seat_estimate=14)],
    "5": [_req("cs330", required=False, seat_estimate=16)],
    "7": [_req("cs420", required=False, seat_estimate=14)],
}

_NEW_COHORTS = [
    Cohort(id="math2026", program_id="bsmath", name="Math 2026 cohort",
           admission_year=2026, graduation_year=2030, current_term=1, size=28),
    Cohort(id="math2025", program_id="bsmath", name="Math 2025 cohort",
           admission_year=2025, graduation_year=2029, current_term=3, size=26),
    Cohort(id="math2024", program_id="bsmath", name="Math 2024 cohort",
           admission_year=2024, graduation_year=2028, current_term=5, size=24),
    Cohort(id="math2023", program_id="bsmath", name="Math 2023 cohort",
           admission_year=2023, graduation_year=2027, current_term=7, size=22),
    Cohort(id="ds2026", program_id="bsds", name="DS 2026 cohort",
           admission_year=2026, graduation_year=2030, current_term=1, size=26),
    Cohort(id="ds2025", program_id="bsds", name="DS 2025 cohort",
           admission_year=2025, graduation_year=2029, current_term=3, size=24),
    Cohort(id="ds2024", program_id="bsds", name="DS 2024 cohort",
           admission_year=2024, graduation_year=2028, current_term=5, size=22),
    Cohort(id="ds2023", program_id="bsds", name="DS 2023 cohort",
           admission_year=2023, graduation_year=2027, current_term=7, size=20),
]


_UNIV_COURSES = [
    # Business wing
    Course(id="bus101", code="BUS 101", title="Introduction to Business", pattern="MWF",
           room_type="lecture", seats=30, equipment=["projector"]),
    Course(id="econ201", code="ECON 201", title="Microeconomics", pattern="MWF",
           room_type="lecture", seats=30, equipment=["projector"]),
    Course(id="bus210", code="BUS 210", title="Marketing Principles", pattern="TTh",
           room_type="lecture", seats=28, equipment=["projector"]),
    Course(id="econ310", code="ECON 310", title="Econometrics", pattern="TTh",
           room_type="lecture", seats=28, equipment=["projector"]),
    Course(id="bus310", code="BUS 310", title="Corporate Finance", pattern="TTh",
           room_type="lecture", seats=26, equipment=["projector"]),
    Course(id="bus280", code="BUS 280", title="Business Analytics Lab", pattern="block",
           room_type="lab", seats=26, equipment=["computers"], duration=3.0),
    Course(id="bus320", code="BUS 320", title="Organizational Behavior", pattern="MWF",
           room_type="seminar", seats=24, equipment=["video-conf"]),
    Course(id="bus410", code="BUS 410", title="Strategy Capstone", pattern="TTh",
           room_type="seminar", seats=24, equipment=["video-conf"]),
    # Humanities wing
    Course(id="eng101", code="ENG 101", title="Composition", pattern="MWF",
           room_type="seminar", seats=24, equipment=["video-conf"]),
    Course(id="hist201", code="HIST 201", title="World History", pattern="TTh",
           room_type="lecture", seats=30, equipment=["projector"]),
    Course(id="eng210", code="ENG 210", title="Literature Survey", pattern="MWF",
           room_type="lecture", seats=26, equipment=["whiteboard"]),
    Course(id="phil220", code="PHIL 220", title="Ethics", pattern="TTh",
           room_type="seminar", seats=22, equipment=["video-conf"]),
    Course(id="hist310", code="HIST 310", title="Modern Europe", pattern="MWF",
           room_type="lecture", seats=24, equipment=["projector"]),
    Course(id="eng320", code="ENG 320", title="Creative Writing Workshop", pattern="block",
           room_type="seminar", seats=10, equipment=["video-conf"], duration=3.0),
    Course(id="eng410", code="ENG 410", title="Senior Thesis Seminar", pattern="TTh",
           room_type="seminar", seats=20, equipment=["video-conf"]),
    Course(id="phil320", code="PHIL 320", title="Philosophy of Mind", pattern="MWF",
           room_type="lecture", seats=20, equipment=["whiteboard"]),
]

_UNIV_INSTRUCTORS = [
    Instructor(id="walsh", name="Prof. Walsh", qualified_courses=["bus101", "econ201"],
               max_sections=2, max_preps=2),
    Instructor(id="xiong", name="Prof. Xiong", qualified_courses=["bus101", "bus210", "econ201"],
               max_sections=2, max_preps=2),
    Instructor(id="yamada", name="Prof. Yamada",
               qualified_courses=["bus210", "bus310", "econ310"],
               max_sections=2, max_preps=2),
    Instructor(id="ahmed", name="Prof. Ahmed",
               qualified_courses=["bus280", "bus310", "econ310"],
               max_sections=2, max_preps=2),
    Instructor(id="zeller", name="Prof. Zeller",
               qualified_courses=["bus280", "bus310", "bus320", "bus410"],
               max_sections=3, max_preps=3),
    Instructor(id="osei", name="Prof. Osei",
               qualified_courses=["bus310", "bus320", "bus410"],
               max_sections=2, max_preps=2),
    Instructor(id="peters", name="Prof. Peters",
               qualified_courses=["eng101", "eng210", "eng410"],
               max_sections=2, max_preps=2),
    Instructor(id="ramos", name="Prof. Ramos",
               qualified_courses=["hist201", "hist310", "phil220", "phil320"],
               max_sections=3, max_preps=3),
    Instructor(id="sato", name="Prof. Sato", qualified_courses=["eng210", "eng320"],
               max_sections=2, max_preps=2),
    Instructor(id="thomas", name="Prof. Thomas", qualified_courses=["phil220", "phil320"],
               max_sections=2, max_preps=2),
    Instructor(id="umar", name="Prof. Umar", qualified_courses=["hist201", "hist310", "eng101"],
               max_sections=2, max_preps=2),
    Instructor(id="vega", name="Prof. Vega", qualified_courses=["eng320", "eng410"],
               max_sections=2, max_preps=2),
]

_UNIV_PROGRAMS = [
    Program(id="bsba", name="BSc Business Administration", roadmap={
        "1": [_req("bus101"), _req("econ201")],
        "3": [_req("bus210"), _req("econ310")],
        "5": [_req("bus310"), _req("bus280")],
        "7": [_req("bus320"), _req("bus410")],
    }),
    Program(id="baengl", name="BA English & Humanities", roadmap={
        "1": [_req("eng101"), _req("hist201")],
        "3": [_req("eng210"), _req("phil220")],
        "5": [_req("hist310"), _req("eng320", required=False, seat_estimate=10)],
        "7": [_req("eng410"), _req("phil320")],
    }),
]

_UNIV_COHORTS = [
    Cohort(id="bus2026", program_id="bsba", name="Business 2026 cohort",
           admission_year=2026, graduation_year=2030, current_term=1, size=30),
    Cohort(id="bus2025", program_id="bsba", name="Business 2025 cohort",
           admission_year=2025, graduation_year=2029, current_term=3, size=28),
    Cohort(id="bus2024", program_id="bsba", name="Business 2024 cohort",
           admission_year=2024, graduation_year=2028, current_term=5, size=26),
    Cohort(id="bus2023", program_id="bsba", name="Business 2023 cohort",
           admission_year=2023, graduation_year=2027, current_term=7, size=24),
    Cohort(id="hum2026", program_id="baengl", name="Humanities 2026 cohort",
           admission_year=2026, graduation_year=2030, current_term=1, size=24),
    Cohort(id="hum2025", program_id="baengl", name="Humanities 2025 cohort",
           admission_year=2025, graduation_year=2029, current_term=3, size=22),
    Cohort(id="hum2024", program_id="baengl", name="Humanities 2024 cohort",
           admission_year=2024, graduation_year=2028, current_term=5, size=20),
    Cohort(id="hum2023", program_id="baengl", name="Humanities 2023 cohort",
           admission_year=2023, graduation_year=2027, current_term=7, size=18),
]


def build_university_scenario(seed: Scenario) -> Scenario:
    """Department cluster + Business and Humanities: an entire university.

    38 instructors · 41 courses/sections · 16 rooms · 5 degree programs ·
    20 cohorts. Same core wing, same demo beats; the solver just sees more
    of the institution sharing the same rooms, slots, and walk matrix.
    """
    sc = build_department_scenario(seed)
    sc.name = "University — Autumn Term (CS + Math + Data Science + Business + Humanities)"
    univ_courses = _clone(_UNIV_COURSES)
    sc.courses.extend(univ_courses)
    sc.sections.extend(Section(id=f"sec-{c.id}", course_id=c.id) for c in univ_courses)
    sc.instructors.extend(_clone(_UNIV_INSTRUCTORS))
    sc.programs.extend(_clone(_UNIV_PROGRAMS))
    sc.cohorts.extend(_clone(_UNIV_COHORTS))
    return sc


# --- Full-university stress scale -------------------------------------------
# The demo "University" above (38 instructors / 41 sections) is a single
# term slice a judge can click through. A real university runs hundreds of
# sections across dozens of degree programs at once, so this tier adds 20
# further programs (16 courses each), 3 more campus buildings with large
# lecture halls, and cohorts sized like real intakes. Deterministic, same
# builder style as the wings above:
#
#   198 instructors · 361 courses/sections · 61 rooms · 7 buildings
#   25 degree programs · 100 cohorts · ~12,000 students (cohort sizes)
#
# Measured behaviour (scripts/benchmark.py): the domain-specialized native
# solver proves the optimum at this scale in seconds; CP-SAT (single
# worker, 10 s budget) does not find a feasible timetable and honestly
# reports "unknown". It is a stress benchmark, not the demo path.

_FULL_SUBJECTS = [
    ("BIO", "Biology"), ("CHEM", "Chemistry"), ("PHYS", "Physics"),
    ("PSY", "Psychology"), ("SOC", "Sociology"), ("GEO", "Geography"),
    ("LAW", "Law"), ("ENV", "Environmental Science"),
    ("ARC", "Architecture"), ("COM", "Communication"),
    ("LIN", "Linguistics"), ("ANT", "Anthropology"),
    ("AST", "Astronomy"), ("GEOL", "Geology"), ("KIN", "Kinesiology"),
    ("RBT", "Robotics"), ("MUS", "Music"), ("ART", "Art & Design"),
    ("PHL", "Philosophy"), ("ECN", "Economics"),
]

_FULL_TITLES = [
    "Foundations", "Principles", "Methods", "Theory", "Systems", "Analysis",
    "Advanced Topics", "Seminar", "Laboratory", "Fieldwork", "Design Studio",
    "Research Methods", "Applied Practice", "History & Context", "Capstone",
    "Colloquium",
]

_FULL_SURNAMES = [
    "Adams", "Baker", "Clark", "Davis", "Evans", "Frost", "Green", "Hall",
    "Irwin", "Jones", "Klein", "Meyer", "Ngata", "Owens", "Price", "Quayle",
    "Reed", "Stone", "Tran", "Upton", "Vidal", "Ward", "Xu", "Young",
    "Zhang", "Ames", "Boone", "Cross", "Drake", "Ellery", "Farrow", "Grady",
    "Hobbs", "Innes", "Jasper", "Keane", "Larkin", "Monroe", "Nash", "Orton",
]


def build_full_university_scenario(seed: Scenario) -> Scenario:
    """University + 20 more programs: a full-university stress instance."""
    sc = build_university_scenario(seed)
    sc.name = "Full University — Autumn Term (25 programs, campus-wide)"

    for bid, bname in [("N", "North Campus"), ("W", "West Campus"),
                       ("T", "Tech Quarter")]:
        sc.buildings.append(Building(id=bid, name=bname))
    new_ids = ["N", "W", "T"]
    for bid in new_ids:
        sc.distances[bid] = {}
        for other in [b.id for b in sc.buildings]:
            sc.distances[bid][other] = 0 if other == bid else 9
            if other != bid:
                sc.distances.setdefault(other, {})[bid] = 9
    for bid in new_ids:
        for suffix, name, cap, rtype, equip in [
            ("hall250", "Grand Hall 250", 240, "lecture", ["projector", "mic", "lecture-capture"]),
            ("hall250b", "Grand Hall 250 B", 240, "lecture", ["projector", "mic", "lecture-capture"]),
            ("hall250c", "Grand Hall 250 C", 240, "lecture", ["projector", "mic", "lecture-capture"]),
            ("hall180a", "Hall 180 A", 180, "lecture", ["projector", "mic"]),
            ("hall180b", "Hall 180 B", 180, "lecture", ["projector", "mic"]),
            ("hall120", "Hall 120", 120, "lecture", ["projector", "mic", "lecture-capture"]),
            ("hall120b", "Hall 120 B", 120, "lecture", ["projector", "mic"]),
            # A 12,000-student campus running 320 large lectures needs about
            # 40 halls, not 22: each 3h/2h pattern occupies 2-3 of the 20
            # weekly room-slots, so hall supply, not seat count, is the
            # binding constraint at this tier.
            ("hall250d", "Grand Hall 250 D", 240, "lecture", ["projector", "mic", "lecture-capture"]),
            ("hall250e", "Grand Hall 250 E", 240, "lecture", ["projector", "mic", "lecture-capture"]),
            ("hall250f", "Grand Hall 250 F", 240, "lecture", ["projector", "mic", "lecture-capture"]),
            ("hall180c", "Hall 180 C", 180, "lecture", ["projector", "mic"]),
            ("hall180d", "Hall 180 D", 180, "lecture", ["projector", "mic"]),
            ("hall120c", "Hall 120 C", 120, "lecture", ["projector", "mic"]),
            ("hall120d", "Hall 120 D", 120, "lecture", ["projector", "mic"]),
            ("lec80", "Lecture 80", 80, "lecture", ["projector"]),
            ("lec45a", "Lecture 45 A", 45, "lecture", ["projector", "whiteboard"]),
            ("lec45b", "Lecture 45 B", 45, "lecture", ["projector", "whiteboard"]),
            ("lec30", "Lecture 30", 30, "lecture", ["projector", "whiteboard"]),
            ("sem25a", "Seminar 25 A", 25, "seminar", ["video-conf", "whiteboard"]),
            ("sem25b", "Seminar 25 B", 25, "seminar", ["video-conf", "whiteboard"]),
            ("lab35a", "Lab 35 A", 35, "lab", ["computers"]),
            ("lab35b", "Lab 35 B", 35, "lab", ["computers"]),
        ]:
            sc.rooms.append(Room(id=f"{bid.lower()}-{suffix}", name=f"{bid} {name}",
                                 building_id=bid, capacity=cap,
                                 room_type=rtype, equipment=equip))

    cohort_sizes = [180, 160, 140, 120]
    for si, (code, name) in enumerate(_FULL_SUBJECTS):
        pid = f"p-{code.lower()}"
        courses: list[Course] = []
        # Four courses per term, two MWF + two TTh: a real full-time load that
        # also respects the two-meetings-per-day cohort cap (C8). Large
        # introductory lectures are cohort-sized; the small lab/seminar rooms
        # are already exercised by the department/university wings.
        for term_index, term in enumerate([1, 3, 5, 7]):
            for position in range(4):
                num = 101 + term_index * 100 + position * 10
                pattern = "MWF" if position % 2 == 0 else "TTh"
                courses.append(Course(
                    id=f"{code.lower()}{num}", code=f"{code} {num}",
                    title=f"{name}: {_FULL_TITLES[term_index * 4 + position]}",
                    pattern=pattern, room_type="lecture",
                    seats=cohort_sizes[term_index], equipment=["projector"]))
        sc.courses.extend(courses)
        sc.sections.extend(Section(id=f"sec-{c.id}", course_id=c.id) for c in courses)
        sc.programs.append(Program(id=pid, name=f"BSc {name}", roadmap={
            str(term): [_req(courses[ti * 4 + position].id) for position in range(4)]
            for ti, term in enumerate([1, 3, 5, 7])
        }))
        for ci, size in enumerate(cohort_sizes):
            sc.cohorts.append(Cohort(
                id=f"{code.lower()}{2026 - ci}", program_id=pid,
                name=f"{name} {2026 - ci} cohort",
                admission_year=2026 - ci, graduation_year=2030 - ci,
                current_term=1 + ci * 2, size=size))
        # Every course has two qualified instructors (no single point of
        # failure); each instructor carries four preps across the catalog.
        for fi in range(8):
            sc.instructors.append(Instructor(
                id=f"{code.lower()}-f{fi}",
                name=f"Prof. {_FULL_SURNAMES[(si * 8 + fi) % len(_FULL_SURNAMES)]}",
                qualified_courses=[
                    courses[fi].id, courses[(fi + 4) % 16].id,
                    courses[(fi + 8) % 16].id, courses[(fi + 12) % 16].id,
                ],
                max_sections=3 if fi % 3 else 4, max_preps=3,
                track="teaching" if fi % 2 == 0 else "research"))
    return sc


# --- Comprehensive university (default institution) -------------------------
# The signed-in app ships with a full institution: every major has a degree
# map, minors are first-class programs, and the campus has several quads. It
# stays solvable in seconds (unlike the 361-section stress tier).

_COMP_SUBJECTS = [
    ("BIO", "Biology", "BSc", "Health Sciences"),
    ("CHEM", "Chemistry", "BSc", "Science"),
    ("PSY", "Psychology", "BA", "Social Sciences"),
    ("ECN", "Economics", "BSc", "Business"),
    ("LAW", "Law", "JD", "Law"),
    ("ART", "Art & Design", "BFA", "Arts"),
    ("NUR", "Nursing", "BSN", "Health Sciences"),
    ("ENV", "Environmental Science", "BSc", "Science"),
    ("ME", "Mechanical Engineering", "BSc", "Engineering"),
    ("EE", "Electrical Engineering", "BSc", "Engineering"),
    ("HIS", "History", "BA", "Humanities"),
    ("PHIL", "Philosophy", "BA", "Humanities"),
    ("SOC", "Sociology", "BA", "Social Sciences"),
    ("POL", "Political Science", "BA", "Social Sciences"),
    ("COM", "Communication", "BA", "Arts"),
    ("EDU", "Education", "BEd", "Education"),
    ("GEO", "Geography", "BSc", "Social Sciences"),
    ("ANT", "Anthropology", "BA", "Social Sciences"),
    ("MUS", "Music", "BM", "Arts"),
    ("KIN", "Kinesiology", "BSc", "Health Sciences"),
]

_COMP_TITLES = [
    "Foundations", "Methods", "Systems", "Analysis",
    "Advanced Topics", "Applications", "Research Seminar", "Capstone",
]

# Five colleges, four majors each. Each college runs its own two-per-term
# general-education service courses, shared by its four majors: one large
# lecture per course (no phantom multi-section cohorts), exactly the way a
# real college teaches a 120-student gen-ed core.
_COMP_COLLEGES = [
    ("NSC", "College of Natural Sciences", ["BIO", "CHEM", "ENV", "GEO"], [
        "Quantitative Reasoning", "Scientific Writing", "Data Analysis",
        "Research Methods", "Modeling & Simulation", "Science Ethics",
        "Capstone Forum", "Science & Society",
    ]),
    ("SSC", "College of Social Sciences", ["PSY", "SOC", "POL", "ANT"], [
        "Social Inquiry", "Academic Writing", "Statistics for Society",
        "Research Methods", "Policy Analysis", "Ethics & Society",
        "Capstone Forum", "Community Engagement",
    ]),
    ("BUA", "College of Business & Law", ["ECN", "LAW", "EDU", "COM"], [
        "Business Fundamentals", "Professional Communication",
        "Financial Literacy", "Business Ethics", "Analytics for Managers",
        "Law & Society", "Strategy Forum", "Global Business",
    ]),
    ("ENR", "College of Engineering & Health", ["ME", "EE", "NUR", "KIN"], [
        "Engineering Graphics", "Technical Communication",
        "Engineering Statistics", "Design Ethics", "Systems Modeling",
        "Project Management", "Capstone Forum", "Technology & Society",
    ]),
    ("HUM", "College of Arts & Humanities", ["ART", "HIS", "PHIL", "MUS"], [
        "Critical Reading", "Academic Writing", "Cultural Studies",
        "Philosophy of Art", "Text & Context", "Ethics & Society",
        "Capstone Seminar", "Arts & Community",
    ]),
]

# One master's and one PhD program per college. Graduate cohorts are small
# (the population mix stays bachelor-dominated), entry is Fall, and the PhD
# research course is the 1-3 credit reservation vehicle.
_COMP_GRADUATE = [
    ("NSC", "MS Natural Sciences", "PhD Natural Sciences"),
    ("SSC", "MS Social Sciences", "PhD Social Sciences"),
    ("BUA", "MBA Business Administration", "PhD Business"),
    ("ENR", "MEng Engineering", "PhD Engineering"),
    ("HUM", "MA Humanities", "PhD Humanities"),
]

_COMP_CAMPUSES = {
    "S": "Science Quad",
    "E": "Engineering Quad",
    "L": "Central Campus",
    "A": "Arts & Humanities",
    "B": "Business District",
    "H": "Health Sciences",
    "M": "Science Quad",
    "D": "Design Quarter",
    "C": "Arts & Humanities",
    "S2": "Social Sciences",
    "E2": "Education",
    "A2": "Arts & Humanities",
    "K": "Health Sciences",
    "G": "Science Quad",
}

# Campus centres in walking units. A building's distance is the Euclidean
# distance between its campus and the other building's campus, plus a small
# deterministic offset, converted to minutes. This replaces the old
# ASCII-sum "distance" that produced numbers with no geographic meaning.
_COMP_CAMPUS_XY = {
    "Science Quad": (0.0, 0.0),
    "Engineering Quad": (4.0, 0.0),
    "Central Campus": (2.0, 2.5),
    "Arts & Humanities": (-2.5, 2.0),
    "Business District": (5.0, 3.5),
    "Health Sciences": (0.0, 5.0),
    "Design Quarter": (-4.0, 0.5),
    "Social Sciences": (2.5, 5.0),
    "Education": (-1.5, 5.0),
    "Main Campus": (0.0, 2.5),
}


def _walk_distances(buildings: list[Building]) -> dict[str, dict[str, int]]:
    """Symmetric, geographically plausible walk minutes for every pair."""
    out: dict[str, dict[str, int]] = {b.id: {} for b in buildings}
    for a in buildings:
        ax, ay = _COMP_CAMPUS_XY.get(a.campus, (0.0, 2.5))
        jax = ((sum(ord(c) for c in a.id) * 7) % 5 - 2) * 0.3
        jay = ((sum(ord(c) for c in a.id) * 11) % 5 - 2) * 0.3
        for b in buildings:
            if a.id == b.id:
                out[a.id][b.id] = 0
                continue
            bx, by = _COMP_CAMPUS_XY.get(b.campus, (0.0, 2.5))
            jbx = ((sum(ord(c) for c in b.id) * 7) % 5 - 2) * 0.3
            jby = ((sum(ord(c) for c in b.id) * 11) % 5 - 2) * 0.3
            raw = math.hypot((ax + jax) - (bx + jbx), (ay + jay) - (by + jby))
            out[a.id][b.id] = max(2, min(22, int(round(raw * 1.5))))
    return out

_COMP_BUILDINGS = [
    ("B", "Business School", "Business District"),
    ("H", "Health Sciences Center", "Health Sciences"),
    ("M", "Mathematics & Statistics", "Science Quad"),
    ("D", "Design & Media Studio", "Design Quarter"),
    ("C", "Communication & Media", "Arts & Humanities"),
    ("S2", "Social Sciences Building", "Social Sciences"),
    ("E2", "Education Building", "Education"),
    ("A2", "Arts & Music Hall", "Arts & Humanities"),
    ("K", "Kinesiology Center", "Health Sciences"),
    ("G", "Geography & Environment", "Science Quad"),
]

_COMP_ROOMS = [
    ("B", "Case Room", 60, "lecture", ["projector", "mic"]),
    ("B", "Case Room B", 45, "lecture", ["projector"]),
    ("B", "Finance Lab", 32, "lab", ["computers"]),
    ("B", "Seminar 12", 24, "seminar", ["video-conf", "whiteboard"]),
    ("H", "Anatomy Lab", 40, "lab", ["computers"]),
    ("H", "Clinical Skills", 30, "lab", ["video-conf"]),
    ("H", "Lecture Hall H1", 120, "lecture", ["projector", "mic"]),
    ("H", "Seminar H2", 26, "seminar", ["video-conf", "whiteboard"]),
    ("M", "Math Lecture 101", 55, "lecture", ["projector"]),
    ("M", "Stats Lab", 34, "lab", ["computers"]),
    ("M", "Seminar 210", 24, "seminar", ["video-conf", "whiteboard"]),
    ("M", "Colloquium", 70, "lecture", ["projector", "mic"]),
    ("D", "Design Studio A", 35, "lab", ["computers"]),
    ("D", "Design Studio B", 30, "lab", ["computers"]),
    ("D", "Crit Space", 28, "seminar", ["video-conf", "whiteboard"]),
    ("D", "Media Lab", 26, "lab", ["computers", "video-conf"]),
    ("C", "Studio C1", 40, "lab", ["computers", "video-conf"]),
    ("C", "Studio C2", 30, "seminar", ["video-conf", "whiteboard"]),
    ("C", "Lecture C3", 70, "lecture", ["projector", "mic"]),
    ("S2", "Lecture S2-1", 60, "lecture", ["projector"]),
    ("S2", "Seminar S2-2", 26, "seminar", ["video-conf", "whiteboard"]),
    ("S2", "Lecture S2-3", 45, "lecture", ["projector"]),
    ("E2", "Teaching Lab", 32, "lab", ["computers"]),
    ("E2", "Lecture E2-1", 55, "lecture", ["projector"]),
    ("E2", "Seminar E2-2", 24, "seminar", ["video-conf", "whiteboard"]),
    ("A2", "Music Hall", 90, "lecture", ["projector", "mic"]),
    ("A2", "Practice Room", 20, "seminar", ["video-conf", "whiteboard"]),
    ("A2", "Art Studio", 30, "lab", ["computers"]),
    ("K", "Kin Lab", 35, "lab", ["computers"]),
    ("K", "Lecture K1", 65, "lecture", ["projector"]),
    ("K", "Seminar K2", 25, "seminar", ["video-conf", "whiteboard"]),
    ("G", "Geo Lab", 30, "lab", ["computers"]),
    ("G", "Lecture G1", 50, "lecture", ["projector"]),
    ("G", "Seminar G2", 22, "seminar", ["video-conf", "whiteboard"]),
    # High-demand rooms for a realistic term (large labs/seminars/lectures).
    ("B", "Lecture 120", 120, "lecture", ["projector", "mic"]),
    ("B", "Lecture 90", 90, "lecture", ["projector", "mic"]),
    ("H", "Lab 40 A", 40, "lab", ["computers"]),
    ("H", "Lab 40 B", 40, "lab", ["computers"]),
    ("M", "Lab 40", 40, "lab", ["computers"]),
    ("C", "Lab 40", 40, "lab", ["computers"]),
    ("S2", "Seminar 36 A", 36, "seminar", ["video-conf", "whiteboard"]),
    ("S2", "Seminar 36 B", 36, "seminar", ["video-conf", "whiteboard"]),
    ("E2", "Seminar 36", 36, "seminar", ["video-conf", "whiteboard"]),
    ("A2", "Seminar 36", 36, "seminar", ["video-conf", "whiteboard"]),
    ("K", "Lab 40", 40, "lab", ["computers"]),
    ("G", "Lab 40", 40, "lab", ["computers"]),
    # One large lecture hall per college for the shared gen-ed courses.
    ("B", "Grand Hall 240", 240, "lecture", ["projector", "mic", "lecture-capture"]),
    ("H", "Grand Hall 240", 240, "lecture", ["projector", "mic", "lecture-capture"]),
    ("M", "Grand Hall 240", 240, "lecture", ["projector", "mic", "lecture-capture"]),
    ("C", "Grand Hall 240", 240, "lecture", ["projector", "mic", "lecture-capture"]),
    ("A2", "Grand Hall 240", 240, "lecture", ["projector", "mic", "lecture-capture"]),
    # Seminar and lab capacity: 40+ small seminars and 20+ lab blocks run in a
    # real term, so the campus needs more than one room per building.
    ("B", "Seminar 36 C", 36, "seminar", ["video-conf", "whiteboard"]),
    ("H", "Seminar 36 C", 36, "seminar", ["video-conf", "whiteboard"]),
    ("M", "Seminar 36 C", 36, "seminar", ["video-conf", "whiteboard"]),
    ("D", "Seminar 36 C", 36, "seminar", ["video-conf", "whiteboard"]),
    ("C", "Seminar 36 C", 36, "seminar", ["video-conf", "whiteboard"]),
    ("S2", "Seminar 36 C", 36, "seminar", ["video-conf", "whiteboard"]),
    ("E2", "Seminar 36 C", 36, "seminar", ["video-conf", "whiteboard"]),
    ("A2", "Seminar 36 C", 36, "seminar", ["video-conf", "whiteboard"]),
    ("K", "Seminar 36 C", 36, "seminar", ["video-conf", "whiteboard"]),
    ("G", "Seminar 36 C", 36, "seminar", ["video-conf", "whiteboard"]),
    ("B", "Lab 40 B", 40, "lab", ["computers"]),
    ("H", "Lab 40 C", 40, "lab", ["computers"]),
    ("M", "Lab 40 B", 40, "lab", ["computers"]),
    ("D", "Lab 40 B", 40, "lab", ["computers"]),
    ("C", "Lab 40 B", 40, "lab", ["computers"]),
    ("S2", "Lab 40", 40, "lab", ["computers"]),
]

_COMP_MINORS = [
    ("cs", "Computer Science", ["cs101", "cs201", "cs301"]),
    ("math", "Mathematics", ["math101", "math210", "math301"]),
    ("ds", "Data Science", ["ds101", "ds210", "stat310"]),
    ("bus", "Business", ["bus101", "bus210", "bus310"]),
    ("eng", "English", ["eng101", "eng210", "eng320"]),
    ("psy", "Psychology", ["psy101", "psy201", "psy301"]),
    ("env", "Environmental Studies", ["env101", "env201", "env301"]),
    ("art", "Art & Design", ["art101", "art201", "art301"]),
]


def build_comprehensive_scenario(seed: Scenario) -> Scenario:
    """The default institution: 20 majors, 5 colleges, 8 minors, 5 quads.

    Built on the university tier (so the demo story and scale proof remain),
    then expanded with the remaining colleges. Every major cohort carries a
    full-time load (two major courses + two shared college service courses),
    every offered course has at least two qualified instructors, and every
    section has a real room. Deterministic and solvable in seconds — the
    361-section tier stays a separate stress benchmark.
    """
    sc = build_university_scenario(seed)
    sc.name = "Northgate University — Autumn Term 2026"

    for building in sc.buildings:
        building.campus = _COMP_CAMPUSES.get(building.id, building.campus or "Main Campus")

    for bid, bname, campus in _COMP_BUILDINGS:
        sc.buildings.append(Building(id=bid, name=bname, campus=campus))

    for bid, name, cap, rtype, equip in _COMP_ROOMS:
        sc.rooms.append(Room(
            id=f"{bid.lower()}-{name.lower().replace(' ', '-')}",
            name=f"{bid} {name}", building_id=bid, capacity=cap,
            room_type=rtype, equipment=equip,
        ))

    # Geography is recomputed for the whole campus, not just the new wing.
    sc.distances = _walk_distances(sc.buildings)

    # -- shared college service courses (one large section per course) ------
    services_by_college: dict[str, list[Course]] = {}
    for college_prefix, _college_name, _majors, titles in _COMP_COLLEGES:
        services: list[Course] = []
        for index, title in enumerate(titles):
            number = 101 + (index // 2) * 100 + (index % 2)
            services.append(Course(
                id=f"svc-{college_prefix.lower()}-{number}",
                code=f"{college_prefix} {number}",
                title=title,
                pattern="MWF" if index % 2 == 0 else "TTh",
                room_type="lecture",
                seats=240,
                equipment=["projector", "mic"],
            ))
        services_by_college[college_prefix] = services
        sc.courses.extend(services)
        sc.sections.extend(Section(id=f"sec-{course.id}", course_id=course.id)
                           for course in services)
        # Four service faculty per college, each qualified for four of the
        # eight courses, so every service course has two qualified teachers.
        for fi in range(4):
            sc.instructors.append(Instructor(
                id=f"svc-{college_prefix.lower()}-f{fi}",
                name=f"Prof. {_FULL_SURNAMES[(len(sc.instructors) + fi) % len(_FULL_SURNAMES)]}",
                qualified_courses=[
                    services[fi].id, services[(fi + 2) % 8].id,
                    services[(fi + 4) % 8].id, services[(fi + 6) % 8].id,
                ],
                max_sections=3,
                max_preps=3,
                track="teaching",
            ))

    college_of = {
        code: college_prefix
        for college_prefix, _name, majors, _titles in _COMP_COLLEGES
        for code in majors
    }

    # -- give the pre-existing university programs a full-time shape too ----
    # The five programs built by build_university_scenario still carry their
    # original 1-3 course terms. Adding the relevant college's service courses
    # (never more than two meetings on any weekday) makes every cohort a real
    # full-time load instead of a demo-sized fragment.
    course_by_id = {c.id: c for c in sc.courses}
    existing_college = {
        "bscs": "NSC", "bsmath": "NSC", "bsds": "NSC",
        "bsba": "BUA", "baengl": "HUM",
    }
    term_index = {1: 0, 3: 1, 5: 2, 7: 3}
    for program in sc.programs:
        college_prefix = existing_college.get(program.id)
        if college_prefix is None:
            continue
        services = services_by_college[college_prefix]
        for term_key in sorted(program.roadmap, key=int):
            ti = term_index.get(int(term_key))
            if ti is None:
                continue
            reqs = program.roadmap[term_key]
            patterns = [
                course_by_id[r.course_id].pattern
                for r in reqs if r.course_id in course_by_id
            ]
            mwf = patterns.count("MWF")
            tth = patterns.count("TTh")
            has_block = "block" in patterns

            def fits(candidate) -> bool:
                if candidate.pattern == "MWF" and mwf >= 2:
                    return False
                if candidate.pattern == "TTh" and tth >= 2:
                    return False
                if has_block:
                    counts = [mwf, tth, mwf, tth, mwf]
                    for day in PATTERN_DAYS.get(candidate.pattern, []):
                        counts[day] += 1
                    if min(counts) > 1:
                        return False
                return True

            candidates = sorted(
                services[2 * ti: 2 * ti + 2],
                key=lambda c: (mwf if c.pattern == "MWF" else tth, c.pattern),
            )
            for candidate in candidates:
                if len(reqs) >= 4:
                    break
                if not fits(candidate):
                    continue
                reqs.append(_req(candidate.id))
                if candidate.pattern == "MWF":
                    mwf += 1
                else:
                    tth += 1

    for si, (code, name, degree, department) in enumerate(_COMP_SUBJECTS):
        prefix = code.lower()
        services = services_by_college[college_of[code]]
        courses: list[Course] = []
        # Two major courses per term; the two service courses make the load
        # four. Patterns are chosen so no cohort has more than two meetings
        # on any weekday (C8): MWF + TTh major, MWF + TTh service.
        specs = [
            ("MWF", "lecture", 1.5), ("TTh", "lecture", 1.5),
            ("block", "lab", 3.0), ("TTh", "lecture", 1.5),
            ("MWF", "lecture", 1.5), ("TTh", "seminar", 1.5),
            ("MWF", "lecture", 1.5), ("TTh", "seminar", 1.5),
        ]
        for term_index, term in enumerate([1, 3, 5, 7]):
            cohort_size = 24 + ((si * 7 + term_index * 5) % 11)
            seats = int(math.ceil(cohort_size / 5.0) * 5)
            for position in range(2):
                index = term_index * 2 + position
                pattern, room_type, duration = specs[index]
                equipment = (
                    ["computers"] if room_type == "lab"
                    else ["video-conf", "whiteboard"] if room_type == "seminar"
                    else ["projector"]
                )
                number = 101 + term_index * 100 + position * 10
                courses.append(Course(
                    id=f"{prefix}{number}",
                    code=f"{code} {number}",
                    title=f"{name}: {_COMP_TITLES[index]}",
                    pattern=pattern,
                    room_type=room_type,
                    seats=seats,
                    equipment=equipment,
                    duration=duration,
                ))
        sc.courses.extend(courses)
        sc.sections.extend(Section(id=f"sec-{course.id}", course_id=course.id)
                           for course in courses)

        sc.programs.append(Program(
            id=f"p-{prefix}",
            name=f"{degree} {name}",
            degree=degree,
            department=department,
            roadmap={
                "1": [_req(courses[0].id), _req(courses[1].id),
                      _req(services[0].id), _req(services[1].id)],
                "3": [_req(courses[2].id), _req(courses[3].id),
                      _req(services[2].id), _req(services[3].id)],
                "5": [_req(courses[4].id), _req(courses[5].id),
                      _req(services[4].id), _req(services[5].id)],
                "7": [_req(courses[6].id), _req(courses[7].id),
                      _req(services[6].id), _req(services[7].id)],
            },
        ))
        for offset, term in enumerate([1, 3, 5, 7]):
            year = 2026 - offset
            sc.cohorts.append(Cohort(
                id=f"{prefix}{year}",
                program_id=f"p-{prefix}",
                name=f"{name} {year} cohort",
                admission_year=year,
                graduation_year=year + 4,
                current_term=term,
                size=24 + ((si * 7 + offset * 5) % 11),
            ))
        # Four major faculty, each qualified for four of the eight courses,
        # so every course has two qualified instructors.
        for faculty_index in range(4):
            sc.instructors.append(Instructor(
                id=f"{prefix}-f{faculty_index}",
                name=f"Prof. {_FULL_SURNAMES[(len(sc.instructors) + faculty_index) % len(_FULL_SURNAMES)]}",
                qualified_courses=[
                    courses[faculty_index].id,
                    courses[(faculty_index + 2) % 8].id,
                    courses[(faculty_index + 4) % 8].id,
                    courses[(faculty_index + 6) % 8].id,
                ],
                max_sections=3 if faculty_index % 2 == 0 else 4,
                max_preps=3,
            ))

    # -- graduate layer: master's + PhD cohorts, supervisors, reservations --
    for gi, (college_prefix, master_name, phd_name) in enumerate(_COMP_GRADUATE):
        grad_services = services_by_college[college_prefix]
        master_courses: list[Course] = []
        for index in range(4):
            number = 501 + (index // 2) * 100 + (index % 2) * 10
            master_courses.append(Course(
                id=f"ms-{college_prefix.lower()}-{number}",
                code=f"{college_prefix} {number}",
                title=f"{master_name}: {'Methods' if index % 2 == 0 else 'Applications'}",
                pattern="MWF" if index % 2 == 0 else "TTh",
                room_type="seminar" if index % 2 else "lecture",
                seats=24,
                equipment=(["video-conf", "whiteboard"] if index % 2
                           else ["projector"]),
                credits=6,
                department=college_prefix,
            ))
        phd_courses = [
            Course(id=f"phd-{college_prefix.lower()}-700",
                   code=f"{college_prefix} 700",
                   title=f"{phd_name}: Research Seminar",
                   pattern="TTh", room_type="seminar", seats=10,
                   equipment=["video-conf", "whiteboard"], credits=3,
                   department=college_prefix),
            Course(id=f"phd-{college_prefix.lower()}-710",
                   code=f"{college_prefix} 710",
                   title=f"{phd_name}: Dissertation Research",
                   pattern="TTh", room_type="seminar", seats=10,
                   equipment=["video-conf", "whiteboard"], credits=3,
                   department=college_prefix),
        ]
        grad_courses = master_courses + phd_courses
        sc.courses.extend(grad_courses)
        sc.sections.extend(Section(id=f"sec-{c.id}", course_id=c.id)
                           for c in grad_courses)

        sc.programs.append(Program(
            id=f"p-ms-{college_prefix.lower()}", name=master_name,
            degree="MS", department=college_prefix,
            roadmap={
                "1": [_req(master_courses[0].id), _req(master_courses[1].id)],
                "3": [_req(master_courses[2].id), _req(master_courses[3].id)],
            },
        ))
        sc.programs.append(Program(
            id=f"p-phd-{college_prefix.lower()}", name=phd_name,
            degree="PhD", department=college_prefix,
            roadmap={
                "1": [_req(phd_courses[0].id)],
                "3": [_req(phd_courses[1].id)],
            },
        ))
        master_size = 16 + gi * 2
        phd_size = 5 + gi
        sc.cohorts.append(Cohort(
            id=f"ms-{college_prefix.lower()}-2026",
            program_id=f"p-ms-{college_prefix.lower()}",
            name=f"{master_name} 2026 cohort",
            admission_year=2026, graduation_year=2028, current_term=1,
            size=master_size, level="master", credits_per_term=12,
            entry_term=1,
        ))
        sc.cohorts.append(Cohort(
            id=f"phd-{college_prefix.lower()}-2026",
            program_id=f"p-phd-{college_prefix.lower()}",
            name=f"{phd_name} 2026 cohort",
            admission_year=2026, graduation_year=2030, current_term=1,
            size=phd_size, level="phd", credits_per_term=9, entry_term=1,
        ))
        # Dedicated graduate faculty per college. Reusing the undergraduate
        # f0/f1 would starve the major's prep/section caps (the solver then
        # cannot cover four undergrad sections with the remaining pair).
        for fi in range(2):
            sc.instructors.append(Instructor(
                id=f"grad-{college_prefix.lower()}-f{fi}",
                name=f"Prof. {_FULL_SURNAMES[(len(sc.instructors) + fi) % len(_FULL_SURNAMES)]}",
                qualified_courses=[c.id for c in master_courses + phd_courses],
                max_sections=4, max_preps=4,
                track="research",
                accepts_phd=(fi == 0),
                max_phd_students=3 if fi == 0 else 0,
            ))

        for n in range(phd_size):
            sc.students.append(Student(
                id=f"phd-{college_prefix.lower()}-2026-s{n + 1}",
                name=f"PhD student {college_prefix} {n + 1}",
                level="phd", program_id=f"p-phd-{college_prefix.lower()}",
                cohort_id=f"phd-{college_prefix.lower()}-2026",
                entry_year=2026, credits_completed=0,
                preferred_days=[1, 3], campus_days=[1, 3],
            ))
        sc.phd_reservations.append(PhDReservation(
            id=f"phd-res-{college_prefix.lower()}-1",
            student_id=f"phd-{college_prefix.lower()}-2026-s1",
            instructor_id=f"grad-{college_prefix.lower()}-f0",
            course_id=phd_courses[0].id, credits=2,
            term="2026-fall", status="approved",
            note="Fall research residency",
        ))

    for code, name, course_ids in _COMP_MINORS:
        existing = [course_id for course_id in course_ids if any(c.id == course_id for c in sc.courses)]
        sc.programs.append(Program(
            id=f"minor-{code}",
            name=f"Minor in {name}",
            kind="minor",
            degree="Minor",
            department=name,
            roadmap={
                "1": [_req(course_id, required=False, seat_estimate=8) for course_id in existing[:1]],
                "3": [_req(course_id, required=False, seat_estimate=8) for course_id in existing[1:2]],
                "5": [_req(course_id, required=False, seat_estimate=8) for course_id in existing[2:3]],
            },
        ))

    return sc


def build_department_scenario(seed: Scenario) -> Scenario:
    """Expand the story seed to department scale (see module docstring)."""
    sc = seed.model_copy(deep=True)
    sc.name = "Department Cluster — Autumn Term (CS + Mathematics + Data Science)"

    sc.buildings.append(Building(id="A", name="Arts & Humanities"))
    for b in ("S", "E", "L"):
        sc.distances[b]["A"] = {"S": 8, "E": 12, "L": 6}[b]
    sc.distances["A"] = {"S": 8, "E": 12, "L": 6, "A": 0}

    new_courses = _clone(_NEW_COURSES)
    sc.rooms.extend(_clone(_NEW_ROOMS))
    sc.courses.extend(new_courses)
    sc.sections.extend(Section(id=f"sec-{c.id}", course_id=c.id) for c in new_courses)
    sc.instructors.extend(_clone(_NEW_INSTRUCTORS))
    sc.programs.extend(_clone(_NEW_PROGRAMS))
    sc.cohorts.extend(_clone(_NEW_COHORTS))

    bscs = next(p for p in sc.programs if p.id == "bscs")
    for term, reqs in _CS_ELECTIVES.items():
        bscs.roadmap[term] = [*bscs.roadmap.get(term, []), *reqs]

    # Keep the term-change beat's subject on her two sections at this scale.
    chen = sc.instructor("chen")
    chen.preferences = [
        *chen.preferences,
        InstructorPreference(kind="prefer", course_id="cs301", weight=8),
        InstructorPreference(kind="prefer", course_id="cs310", weight=8),
    ]
    return sc
