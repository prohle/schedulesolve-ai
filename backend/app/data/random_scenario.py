"""Randomized, realistic institution variants for feasibility testing.

The shipped tiers are deterministic stories. To test whether a solver is
actually robust — not tuned to one hand-authored instance — we perturb the
same realistic structure with seeded randomness:

- cohort sizes drawn per level (bachelor / master / PhD),
- faculty tracks and student-load caps,
- section seat caps resized to the projected enrollment,
- realistic soft preferences and sparse hard blackouts,
- room maintenance blackouts, term closures, post-add/drop enrollment,
- catalog decisions (a course not taught, a one-off special topic),
- a coordinator load policy draw.

Every variant is checked by `realism.audit_scenario` before it is handed to a
solver. Seeded: the same seed always produces the same institution.
"""

from __future__ import annotations

import json
import math
import random

from app import config
from app.data.department import build_comprehensive_scenario, build_department_scenario
from app.data.realism import audit_scenario
from app.models.scenario import (
    InstructorPreference,
    RoomBlackout,
    Scenario,
    SlotRef,
    TermClosure,
)
from app.services.offerings import add_special_topic, set_offering


def _seed_scenario() -> Scenario:
    with open(config.SEED_SCENARIO_PATH) as handle:
        return Scenario.model_validate(json.load(handle))


def _max_room_capacity(sc: Scenario, course) -> int:
    return max(
        (r.capacity for r in sc.rooms
         if r.room_type == course.room_type
         and set(course.equipment) <= set(r.equipment)),
        default=0,
    )


def _resize_cohorts(sc: Scenario, rng: random.Random) -> None:
    for cohort in sc.cohorts:
        if cohort.level == "phd":
            cohort.size = rng.randint(3, 7)
        elif cohort.level == "master":
            cohort.size = rng.randint(12, 20)
        else:
            cohort.size = rng.randint(18, 30)
        cohort.credits_per_term = {
            "phd": rng.choice([6, 9, 12]),
            "master": rng.choice([9, 12, 15]),
            "bachelor": rng.choice([12, 15, 18]),
        }[cohort.level]


def _resize_seats(sc: Scenario) -> None:
    """A section's seat cap must cover its projected enrollment, but no more
    than the largest room that can actually host it."""
    for course in sc.courses:
        sections = sc.sections_of_course(course.id)
        if not sections:
            continue
        need = max(sc.enrollment_for_section(s) for s in sections)
        room_cap = _max_room_capacity(sc, course)
        if room_cap:
            need = min(need, room_cap)
        course.seats = max(course.seats, int(math.ceil(need / 5.0) * 5))


def _randomize_faculty(sc: Scenario, rng: random.Random) -> None:
    for instructor in sc.instructors:
        instructor.track = "teaching" if rng.random() < 0.35 else "research"
        instructor.max_sections = rng.choice([2, 3, 4])
        instructor.max_preps = min(instructor.max_sections, rng.choice([2, 3, 4]))
        instructor.max_student_load = round(
            sc.policy.faculty_load_cap(instructor.track) * rng.uniform(0.95, 1.4), 2)

        # Realistic soft feedback: early mornings and Fridays are the two
        # most common avoidances; a course wish is the most common "prefer".
        def add_pref(**kwargs) -> None:
            key = (kwargs.get("kind"), kwargs.get("day"),
                   kwargs.get("period"), kwargs.get("course_id"))
            if any((p.kind, p.day, p.period, p.course_id) == key
                   for p in instructor.preferences):
                return
            instructor.preferences.append(InstructorPreference(**kwargs))

        if rng.random() < 0.55:
            add_pref(kind="avoid", period=0, weight=rng.choice([5, 8, 10]))
        if rng.random() < 0.35:
            add_pref(kind="avoid", day=4, weight=rng.choice([5, 8]))
        if instructor.qualified_courses and rng.random() < 0.45:
            add_pref(kind="prefer",
                     course_id=rng.choice(instructor.qualified_courses),
                     weight=rng.choice([5, 8]))
        if rng.random() < 0.25:
            slot = SlotRef(day=rng.choice([0, 4]), period=rng.choice([0, 3]))
            if all((s.day, s.period) != (slot.day, slot.period)
                   for s in instructor.hard_unavailable):
                instructor.hard_unavailable.append(slot)

    total_load = sum(sc.section_load_units(s) for s in sc.sections)
    total_cap = sum(sc.instructor_load_cap(i) for i in sc.instructors)
    if total_cap < total_load * 1.05:
        factor = (total_load * 1.05) / max(1.0, total_cap)
        for instructor in sc.instructors:
            instructor.max_student_load = round(
                sc.instructor_load_cap(instructor) * factor, 2)


def _randomize_physical(sc: Scenario, rng: random.Random) -> None:
    # A small number of maintenance blackouts and one possible closure.
    for _ in range(rng.choice([0, 1, 2])):
        room = rng.choice(sc.rooms)
        sc.room_blackouts.append(RoomBlackout(
            room_id=room.id, day=rng.randrange(5),
            period=rng.choice([None, 0, 1, 2, 3])))
    if rng.random() < 0.35:
        sc.closures.append(TermClosure(
            day=rng.randrange(5),
            period=rng.choice([None, 0, 1, 2, 3]),
            label="Randomized reading day"))
    # Post-add/drop reality: a few sections differ from the projection.
    for section in rng.sample(sc.sections, min(len(sc.sections), rng.randint(0, 5))):
        projected = sc.enrollment_for_section(section)
        course = sc.course(section.course_id)
        actual = max(1, min(course.seats,
                            int(round(projected * rng.uniform(0.8, 1.15)))))
        sc.active_enrollment[section.id] = actual


def _randomize_catalog(sc: Scenario, rng: random.Random) -> None:
    planned = {
        r.course_id for c in sc.cohorts
        for p in sc.programs if p.id == c.program_id
        for r in p.roadmap.get(str(c.current_term), [])
    }
    candidates = [
        c for c in sc.courses
        if c.id not in planned and not c.is_special_topic
        and not c.id.startswith("svc-")
    ]
    if candidates and rng.random() < 0.7:
        course = rng.choice(candidates)
        set_offering(sc, course.id, "not_offered",
                     reason="Randomized audit: catalog course paused this term",
                     term="current", recorded_by="randomized-audit")
    if rng.random() < 0.5:
        instructor = min(sc.instructors, key=lambda i: i.id)
        try:
            sc, course = add_special_topic(
                sc, code=f"AUD {rng.randint(100, 999)}",
                title="Audit special topic", department="Audit",
                instructor_id=instructor.id, credits=rng.choice([1, 2, 3]),
                pattern="TTh", room_type="seminar", seats=15,
                reason="Randomized audit: one-off special topic",
                recorded_by="randomized-audit")
            # A one-person special topic is a single point of failure; add a
            # second qualified instructor, as a real department would.
            backup = next(i for i in sc.instructors if i.id != instructor.id)
            if course.id not in backup.qualified_courses:
                backup.qualified_courses.append(course.id)
        except (ValueError, StopIteration):
            pass


def build_random_scenario(
    seed: int = 0,
    *,
    base: str = "comprehensive",
    perturb: bool = True,
) -> Scenario:
    """Seeded realistic variant. `base` is 'comprehensive' or 'department'."""
    rng = random.Random(seed)
    if base == "department":
        sc = build_department_scenario(_seed_scenario())
    else:
        sc = build_comprehensive_scenario(_seed_scenario())

    sc.name = f"{sc.name} — randomized audit seed {seed}"
    sc.policy.load_exponent = round(rng.uniform(0.55, 0.85), 3)
    sc.policy.min_courses_full_time = rng.choice([3, 4, 5])
    sc.policy.min_credits_full_time = rng.choice([9, 12, 15])

    _resize_cohorts(sc, rng)
    _resize_seats(sc)
    _randomize_faculty(sc, rng)
    if perturb:
        _randomize_physical(sc, rng)
        _randomize_catalog(sc, rng)

    # Records carry wall-clock timestamps; a seeded audit instance must be
    # byte-for-byte reproducible, so pin them to the seed.
    for record in sc.course_offerings:
        record.recorded_at = f"seed-{seed}"
    report = audit_scenario(sc)
    if not report.ok:
        detail = "; ".join(f"{i.code}:{i.entity}" for i in report.errors[:6])
        raise ValueError(f"randomized scenario seed {seed} failed audit: {detail}")
    return sc
