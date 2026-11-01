"""Faculty student-load and full-time policy.

A section count is a poor proxy for teaching work: a 3-credit lecture with 180
students is not the same job as a 3-credit seminar with 12. This module prices
a section as ``credits * (enrollment / 40) ** exponent`` load units, so:

    3-credit, 40 students  = 3.0 units   (the reference class)
    3-credit, 80 students  = 4.9 units   (not 6.0)
    3-credit, 160 students = 7.9 units   (not 12.0)

The exponent is coordinator-owned (``AcademicPolicy.load_exponent``); the
default 0.7 is the empirically sane middle. ``suggest_load_policy`` turns a
coordinator's target ("80 students should be ~1.6x a 40-student class") into
an exponent instead of making them guess.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from app.models.results import Timetable
from app.models.scenario import Instructor, Scenario


@dataclass
class InstructorLoad:
    instructor_id: str
    name: str
    track: str
    sections: int
    students: int
    credits: int
    load_units: float
    load_cap: float
    utilization: float
    full_time: bool
    over_cap: bool
    courses: list[str] = field(default_factory=list)


@dataclass
class LoadReport:
    policy: dict
    instructors: list[InstructorLoad]
    total_sections: int
    total_students: int
    total_credits: int
    total_load_units: float
    total_capacity: float
    overloaded: list[str]

    @property
    def all_within_cap(self) -> bool:
        return not self.overloaded


def section_load_units(sc: Scenario, enrollment: int, credits: int) -> float:
    return sc.policy.section_load_units(enrollment, credits)


def instructor_loads(sc: Scenario, timetable: Timetable | None) -> LoadReport:
    """Recompute every instructor's load from placements (never from a claim)."""
    placements = timetable.placements if timetable else []
    by_instructor: dict[str, list] = {}
    for p in placements:
        by_instructor.setdefault(p.instructor_id, []).append(p)

    rows: list[InstructorLoad] = []
    for inst in sc.instructors:
        mine = by_instructor.get(inst.id, [])
        students = 0
        credits = 0
        load = 0.0
        courses: set[str] = set()
        for p in mine:
            section = next((s for s in sc.sections if s.id == p.section_id), None)
            if section is None:
                continue
            course = sc.course(section.course_id)
            enrollment = sc.enrollment_for_section(section)
            students += enrollment
            credits += course.credits
            load += sc.policy.section_load_units(enrollment, course.credits)
            courses.add(course.id)
        cap = sc.instructor_load_cap(inst)
        rows.append(InstructorLoad(
            instructor_id=inst.id,
            name=inst.name,
            track=inst.track,
            sections=len(mine),
            students=students,
            credits=credits,
            load_units=round(load, 3),
            load_cap=round(cap, 3),
            utilization=round(load / cap, 3) if cap else 0.0,
            full_time=load >= cap * 0.999,
            over_cap=load > cap + 1e-9,
            courses=sorted(courses),
        ))

    return LoadReport(
        policy=sc.policy.model_dump(),
        instructors=rows,
        total_sections=len(placements),
        total_students=sum(r.students for r in rows),
        total_credits=sum(r.credits for r in rows),
        total_load_units=round(sum(r.load_units for r in rows), 3),
        total_capacity=round(sum(r.load_cap for r in rows), 3),
        overloaded=[r.instructor_id for r in rows if r.over_cap],
    )


def student_full_time(sc: Scenario, courses: int, credits: int) -> bool:
    return sc.policy.is_full_time(courses, credits)


def suggest_load_policy(target_ratio_80_40: float = 1.6) -> dict:
    """Recommend a load exponent/multiplier from a coordinator's intent.

    ``target_ratio_80_40`` is "how many times a 80-student class should count
    compared with a 40-student class". 1.6 is the default recommendation:
    more work, but not double. The returned exponent is clamped to a sane
    range so the UI never suggests a linear (1.0) or flat (0.0) curve.
    """
    ratio = max(1.01, min(2.0, float(target_ratio_80_40)))
    exponent = math.log(ratio) / math.log(2.0)
    exponent = round(max(0.35, min(1.0, exponent)), 3)
    examples = {
        str(n): round((n / 40.0) ** exponent, 2) for n in (20, 40, 80, 160, 240)
    }
    return {
        "load_exponent": exponent,
        "load_multiplier": 1.0,
        "target_ratio_80_40": ratio,
        "examples_relative_to_40": examples,
        "explanation": (
            f"A 3-credit, 40-student class is 3.0 load units. "
            f"With exponent {exponent}, an 80-student class is "
            f"{examples['80'] * 3:.1f} units (not 6.0), and a 160-student "
            f"class is {examples['160'] * 3:.1f} units."
        ),
    }
