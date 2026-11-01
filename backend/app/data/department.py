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

from app.models.scenario import (
    Building,
    Cohort,
    Course,
    Instructor,
    InstructorPreference,
    Program,
    RoadmapRequirement,
    Room,
    Scenario,
    Section,
    SlotRef,
)


def _req(course_id: str, required: bool = True, seat_estimate: int | None = None):
    return RoadmapRequirement(course_id=course_id, required=required,
                              seat_estimate=seat_estimate)


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
    Instructor(id="xiong", name="Prof. Xiong", qualified_courses=["bus101", "bus210"],
               max_sections=2, max_preps=2),
    Instructor(id="yamada", name="Prof. Yamada", qualified_courses=["bus210", "econ310"],
               max_sections=2, max_preps=2),
    Instructor(id="ahmed", name="Prof. Ahmed", qualified_courses=["bus280", "econ310"],
               max_sections=2, max_preps=2),
    Instructor(id="zeller", name="Prof. Zeller",
               qualified_courses=["bus310", "bus320", "bus410"],
               max_sections=2, max_preps=2),
    Instructor(id="osei", name="Prof. Osei", qualified_courses=["bus320", "bus410"],
               max_sections=2, max_preps=2),
    Instructor(id="peters", name="Prof. Peters",
               qualified_courses=["eng101", "eng210", "eng410"],
               max_sections=2, max_preps=2),
    Instructor(id="ramos", name="Prof. Ramos", qualified_courses=["hist201", "hist310"],
               max_sections=2, max_preps=2),
    Instructor(id="sato", name="Prof. Sato", qualified_courses=["eng210", "eng320"],
               max_sections=2, max_preps=2),
    Instructor(id="thomas", name="Prof. Thomas", qualified_courses=["phil220", "phil320"],
               max_sections=2, max_preps=2),
    Instructor(id="umar", name="Prof. Umar", qualified_courses=["hist201", "eng101"],
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
    sc.courses.extend(_UNIV_COURSES)
    sc.sections.extend(Section(id=f"sec-{c.id}", course_id=c.id) for c in _UNIV_COURSES)
    sc.instructors.extend(_UNIV_INSTRUCTORS)
    sc.programs.extend(_UNIV_PROGRAMS)
    sc.cohorts.extend(_UNIV_COHORTS)
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
        for k in range(16):
            num = 101 + (k // 2) * 100 + (k % 2) * 10
            if k < 8:  # offered to a live cohort this term: cohort-sized lectures
                pattern = "MWF" if k % 2 == 0 else "TTh"
                rtype, seats = "lecture", cohort_sizes[k // 2]
                equip = ["projector"]
            else:
                pattern = "block" if k % 8 == 6 else ("MWF" if k % 2 == 0 else "TTh")
                rtype = "lab" if pattern == "block" else ("seminar" if k == 15 else "lecture")
                seats = 28 if rtype == "lab" else 22 if rtype == "seminar" else 30
                equip = (["computers"] if rtype == "lab"
                         else ["video-conf"] if rtype == "seminar" else ["projector"])
            courses.append(Course(
                id=f"{code.lower()}{num}", code=f"{code} {num}",
                title=f"{name}: {_FULL_TITLES[k]}", pattern=pattern,
                room_type=rtype, seats=seats, equipment=equip,
                duration=3.0 if pattern == "block" else 1.5))
        sc.courses.extend(courses)
        sc.sections.extend(Section(id=f"sec-{c.id}", course_id=c.id) for c in courses)
        sc.programs.append(Program(id=pid, name=f"BSc {name}", roadmap={
            str(term): [_req(courses[ti * 2].id), _req(courses[ti * 2 + 1].id)]
            for ti, term in enumerate([1, 3, 5, 7])
        }))
        for ci, size in enumerate(cohort_sizes):
            sc.cohorts.append(Cohort(
                id=f"{code.lower()}{2026 - ci}", program_id=pid,
                name=f"{name} {2026 - ci} cohort",
                admission_year=2026 - ci, graduation_year=2030 - ci,
                current_term=1 + ci * 2, size=size))
        for fi in range(8):
            sc.instructors.append(Instructor(
                id=f"{code.lower()}-f{fi}",
                name=f"Prof. {_FULL_SURNAMES[(si * 8 + fi) % len(_FULL_SURNAMES)]}",
                qualified_courses=[courses[fi].id, courses[fi + 8].id,
                                   courses[(fi + 4) % 16].id],
                max_sections=3, max_preps=3))
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
]

_COMP_TITLES = [
    "Foundations", "Methods", "Systems", "Analysis", "Advanced Topics", "Capstone",
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
}

_COMP_BUILDINGS = [
    ("B", "Business School", "Business District"),
    ("H", "Health Sciences Center", "Health Sciences"),
    ("M", "Mathematics & Statistics", "Science Quad"),
    ("D", "Design & Media Studio", "Design Quarter"),
]

_COMP_ROOMS = [
    ("B", "Case Room", 60, "lecture", ["projector", "mic"]),
    ("B", "Case Room B", 45, "lecture", ["projector"]),
    ("B", "Finance Lab", 32, "lab", ["computers"]),
    ("B", "Seminar 12", 24, "seminar", ["video-conf"]),
    ("H", "Anatomy Lab", 40, "lab", ["computers"]),
    ("H", "Clinical Skills", 30, "lab", ["video-conf"]),
    ("H", "Lecture Hall H1", 120, "lecture", ["projector", "mic"]),
    ("H", "Seminar H2", 26, "seminar", ["video-conf"]),
    ("M", "Math Lecture 101", 55, "lecture", ["projector"]),
    ("M", "Stats Lab", 34, "lab", ["computers"]),
    ("M", "Seminar 210", 24, "seminar", ["whiteboard"]),
    ("M", "Colloquium", 70, "lecture", ["projector", "mic"]),
    ("D", "Design Studio A", 35, "lab", ["computers"]),
    ("D", "Design Studio B", 30, "lab", ["computers"]),
    ("D", "Crit Space", 28, "seminar", ["video-conf"]),
    ("D", "Media Lab", 26, "lab", ["computers", "video-conf"]),
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
    """The default institution: 15 majors, 8 minors, several campus quads.

    Built on the university tier (so the demo story and scale proof remain),
    then expanded with the remaining colleges. Deterministic and solvable in
    seconds — the 361-section tier stays a separate stress benchmark.
    """
    sc = build_university_scenario(seed)
    sc.name = "Northgate University — Autumn Term 2026"

    for building in sc.buildings:
        building.campus = _COMP_CAMPUSES.get(building.id, "Main Campus")

    for bid, bname, campus in _COMP_BUILDINGS:
        sc.buildings.append(Building(id=bid, name=bname, campus=campus))
        sc.distances[bid] = {}
        for other in [b.id for b in sc.buildings]:
            walk = 0 if other == bid else 8 + (abs(ord(bid) - ord(other)) % 5)
            sc.distances[bid][other] = walk
            if other != bid:
                sc.distances.setdefault(other, {})[bid] = walk

    for bid, name, cap, rtype, equip in _COMP_ROOMS:
        sc.rooms.append(Room(
            id=f"{bid.lower()}-{name.lower().replace(' ', '-')}",
            name=f"{bid} {name}", building_id=bid, capacity=cap,
            room_type=rtype, equipment=equip,
        ))

    for code, name, degree, department in _COMP_SUBJECTS:
        prefix = code.lower()
        courses: list[Course] = []
        for index, title in enumerate(_COMP_TITLES):
            number = 101 + (index // 2) * 100 + (index % 2) * 10
            pattern = "MWF" if index % 2 == 0 else "TTh"
            room_type = "lab" if index == 2 else ("seminar" if index == 5 else "lecture")
            equipment = (
                ["computers"] if room_type == "lab"
                else ["video-conf"] if room_type == "seminar"
                else ["projector"]
            )
            courses.append(Course(
                id=f"{prefix}{number}",
                code=f"{code} {number}",
                title=f"{name}: {title}",
                pattern=pattern,
                room_type=room_type,
                seats=30 if room_type == "lecture" else 24 if room_type == "lab" else 20,
                equipment=equipment,
            ))
        sc.courses.extend(courses)
        sc.sections.extend(Section(id=f"sec-{course.id}", course_id=course.id) for course in courses)

        sc.programs.append(Program(
            id=f"p-{prefix}",
            name=f"{degree} {name}",
            degree=degree,
            department=department,
            roadmap={
                "1": [_req(courses[0].id), _req(courses[1].id)],
                "3": [_req(courses[2].id), _req(courses[3].id)],
                "5": [_req(courses[4].id), _req(courses[5].id)],
            },
        ))
        for offset, size in enumerate((34, 30, 26)):
            year = 2026 - offset
            sc.cohorts.append(Cohort(
                id=f"{prefix}{year}",
                program_id=f"p-{prefix}",
                name=f"{name} {year} cohort",
                admission_year=year,
                graduation_year=year + 4,
                current_term=1 + offset * 2,
                size=size,
            ))
        for faculty_index in range(3):
            sc.instructors.append(Instructor(
                id=f"{prefix}-f{faculty_index}",
                name=f"Prof. {_FULL_SURNAMES[(len(sc.instructors) + faculty_index) % len(_FULL_SURNAMES)]}",
                qualified_courses=[
                    courses[faculty_index].id,
                    courses[faculty_index + 3].id,
                ],
                max_sections=2,
                max_preps=2,
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

    sc.rooms.extend(_NEW_ROOMS)
    sc.courses.extend(_NEW_COURSES)
    sc.sections.extend(Section(id=f"sec-{c.id}", course_id=c.id) for c in _NEW_COURSES)
    sc.instructors.extend(_NEW_INSTRUCTORS)
    sc.programs.extend(_NEW_PROGRAMS)
    sc.cohorts.extend(_NEW_COHORTS)

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
