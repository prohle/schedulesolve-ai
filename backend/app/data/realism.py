"""Data-realism audit for institution scenarios.

A scenario can be perfectly solvable and still be nonsense: a cohort whose
degree map has no courses for the term it is in, a course only one person on
campus is qualified to teach, a section whose projected enrollment exceeds its
own seat cap, a building missing from the walk matrix. Those are exactly the
defects a coordinator would catch on day one, so they are checked here instead
of being hidden behind a green solver status.

`audit_scenario` returns structured issues. Errors mean the data is internally
inconsistent or structurally unfair (a single point of failure). Warnings mean
the data is thin or looks synthetic but can still be solved.

The checks are deliberately about *shape*, not scale: the story seed is a
small hand-authored demo slice and is allowed to be small, but it is not
allowed to reference missing entities or invent a cohort with no plan.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass, field

from app.models.scenario import PERIOD_COUNT, Scenario


@dataclass(frozen=True)
class Issue:
    severity: str          # "error" | "warning"
    code: str
    entity: str
    message: str

    def as_dict(self) -> dict:
        return {"severity": self.severity, "code": self.code,
                "entity": self.entity, "message": self.message}


@dataclass
class AuditReport:
    scenario: str
    issues: list[Issue] = field(default_factory=list)

    @property
    def errors(self) -> list[Issue]:
        return [i for i in self.issues if i.severity == "error"]

    @property
    def warnings(self) -> list[Issue]:
        return [i for i in self.issues if i.severity == "warning"]

    @property
    def ok(self) -> bool:
        return not self.errors

    def add(self, severity: str, code: str, entity: str, message: str) -> None:
        self.issues.append(Issue(severity, code, entity, message))

    def counts(self) -> dict[str, int]:
        return {"errors": len(self.errors), "warnings": len(self.warnings)}

    def summary(self) -> str:
        return (f"{self.scenario}: {len(self.errors)} error(s), "
                f"{len(self.warnings)} warning(s)")


def _dupes(values: list[str]) -> list[str]:
    return sorted(k for k, n in Counter(values).items() if n > 1)


def audit_scenario(sc: Scenario) -> AuditReport:
    """Run every realism/consistency check. Errors make the scenario invalid."""
    rep = AuditReport(scenario=sc.name)

    buildings = {b.id for b in sc.buildings}
    rooms = {r.id: r for r in sc.rooms}
    courses = {c.id: c for c in sc.courses}
    sections = {s.id: s for s in sc.sections}
    instructors = {i.id: i for i in sc.instructors}
    programs = {p.id: p for p in sc.programs}
    cohorts = {c.id: c for c in sc.cohorts}

    # -- identity / referential integrity ----------------------------------
    for label, ids in [
        ("building", [b.id for b in sc.buildings]),
        ("room", [r.id for r in sc.rooms]),
        ("course", [c.id for c in sc.courses]),
        ("section", [s.id for s in sc.sections]),
        ("instructor", [i.id for i in sc.instructors]),
        ("program", [p.id for p in sc.programs]),
        ("cohort", [c.id for c in sc.cohorts]),
    ]:
        for dup in _dupes(ids):
            rep.add("error", "duplicate-id", dup, f"duplicate {label} id {dup!r}")

    for dup in _dupes([c.code for c in sc.courses]):
        rep.add("error", "duplicate-course-code", dup,
                f"course code {dup!r} appears more than once")

    for r in sc.rooms:
        if r.building_id not in buildings:
            rep.add("error", "dangling-room-building", r.id,
                    f"room {r.id} points at missing building {r.building_id}")
        if r.capacity < 1:
            rep.add("error", "room-capacity", r.id, f"room {r.id} capacity {r.capacity} < 1")
        if r.room_type not in ("lecture", "lab", "seminar"):
            rep.add("error", "room-type", r.id, f"room {r.id} has unknown type {r.room_type}")

    for s in sc.sections:
        if s.course_id not in courses:
            rep.add("error", "dangling-section-course", s.id,
                    f"section {s.id} points at missing course {s.course_id}")

    # -- coordinator-owned grid / policy -----------------------------------
    if not sc.time_grid.periods:
        rep.add("error", "empty-time-grid", "time_grid", "the teaching day has no periods")
    for period in sc.time_grid.periods:
        if period.minutes < 20 or period.minutes > 300:
            rep.add("error", "period-length", "time_grid",
                    f"period {period.start}-{period.end} is {period.minutes} minutes")
    if not sc.time_grid.patterns:
        rep.add("error", "empty-pattern-catalog", "time_grid",
                "no meeting patterns are configured")
    for dup in _dupes([p.name for p in sc.time_grid.patterns]):
        rep.add("error", "duplicate-pattern", dup,
                f"meeting pattern {dup!r} appears more than once")
    for pattern in sc.time_grid.patterns:
        if pattern.kind == "weekly" and not pattern.days:
            rep.add("error", "pattern-days", pattern.name,
                    f"weekly pattern {pattern.name} has no meeting days")
        for day in pattern.days:
            if not 0 <= day <= 4:
                rep.add("error", "pattern-day-range", pattern.name,
                        f"pattern {pattern.name} day {day} outside 0..4")
        for period in pattern.periods:
            if not 0 <= period < sc.time_grid.period_count:
                rep.add("error", "pattern-period-range", pattern.name,
                        f"pattern {pattern.name} period {period} outside the grid")
        if pattern.duration_hours <= 0:
            rep.add("error", "pattern-duration", pattern.name,
                    f"pattern {pattern.name} has non-positive duration")
    if sc.policy.min_courses_full_time < 1 or sc.policy.min_credits_full_time < 1:
        rep.add("error", "full-time-policy", "policy",
                "full-time thresholds must be positive")

    for c in sc.courses:
        if c.seats < 1:
            rep.add("error", "course-seats", c.id, f"course {c.code} seats {c.seats} < 1")
        if not 1 <= c.credits <= 6:
            rep.add("error", "course-credits", c.id,
                    f"course {c.code} credits {c.credits} outside 1..6")
        if c.is_special_topic and not 1 <= c.credits <= 4:
            rep.add("error", "special-topic-credits", c.id,
                    f"special topic {c.code} credits {c.credits} outside 1..4")
        try:
            pattern = sc.pattern(c.pattern)
        except KeyError:
            rep.add("error", "unknown-pattern", c.id,
                    f"course {c.code} uses pattern {c.pattern!r}, not in the grid")
        else:
            if abs(c.duration_hours() - pattern.duration_hours) > 1e-6:
                rep.add("error", "course-duration", c.id,
                        f"course {c.code} pattern {c.pattern} has duration "
                        f"{c.duration_hours()}h, grid says {pattern.duration_hours}h")

    for i in sc.instructors:
        for cid in i.qualified_courses:
            if cid not in courses:
                rep.add("error", "dangling-qualification", i.id,
                        f"instructor {i.id} qualified for missing course {cid}")
        if i.max_sections < 1:
            rep.add("error", "load-cap", i.id, f"instructor {i.id} max_sections < 1")
        if i.max_preps < 1:
            rep.add("error", "prep-cap", i.id, f"instructor {i.id} max_preps < 1")
        if i.max_preps > i.max_sections:
            rep.add("warning", "prep-cap-above-load", i.id,
                    f"instructor {i.id} allows {i.max_preps} preps for {i.max_sections} sections")
        if i.max_student_load is not None and i.max_student_load <= 0:
            rep.add("error", "student-load-cap", i.id,
                    f"instructor {i.id} has non-positive student-load cap")
        if i.accepts_phd and i.max_phd_students > sc.policy.phd_max_students_per_fall:
            rep.add("warning", "phd-cap-above-policy", i.id,
                    f"instructor {i.id} accepts {i.max_phd_students} PhD students "
                    f"above the policy ceiling {sc.policy.phd_max_students_per_fall}")
        seen_slots = set()
        for slot in i.hard_unavailable:
            if not (0 <= slot.day <= 4 and 0 <= slot.period < PERIOD_COUNT):
                rep.add("error", "bad-blackout", i.id,
                        f"instructor {i.id} has invalid blackout {slot.day}/{slot.period}")
            if (slot.day, slot.period) in seen_slots:
                rep.add("warning", "duplicate-blackout", i.id,
                        f"instructor {i.id} repeats blackout {slot.day}/{slot.period}")
            seen_slots.add((slot.day, slot.period))
        seen_prefs = set()
        for pref in i.preferences:
            if pref.course_id is not None and pref.course_id not in courses:
                rep.add("error", "dangling-preference", i.id,
                        f"instructor {i.id} prefers missing course {pref.course_id}")
            key = (pref.kind, pref.day, pref.period, pref.course_id)
            if key in seen_prefs:
                rep.add("warning", "duplicate-preference", i.id,
                        f"instructor {i.id} repeats preference {key}")
            seen_prefs.add(key)
            if pref.day is not None and not 0 <= pref.day <= 4:
                rep.add("error", "bad-preference", i.id,
                        f"instructor {i.id} preference day {pref.day} out of range")
            if pref.period is not None and not 0 <= pref.period < PERIOD_COUNT:
                rep.add("error", "bad-preference", i.id,
                        f"instructor {i.id} preference period {pref.period} out of range")

    # -- walk matrix --------------------------------------------------------
    for b in sc.buildings:
        if b.id not in sc.distances:
            rep.add("error", "missing-distance-row", b.id,
                    f"building {b.id} has no walk-distance row")
            continue
        for other in sc.buildings:
            if other.id not in sc.distances[b.id]:
                rep.add("error", "missing-distance", f"{b.id}->{other.id}",
                        f"walk distance {b.id}->{other.id} is missing")
        own = sc.distances[b.id].get(b.id)
        if own != 0:
            rep.add("error", "distance-diagonal", b.id,
                    f"walk distance {b.id}->{b.id} is {own}, expected 0")
        for other_id, value in sc.distances[b.id].items():
            if other_id not in buildings:
                rep.add("warning", "unknown-distance-column", b.id,
                        f"walk row {b.id} references unknown building {other_id}")
            if not isinstance(value, int) or value < 0 or value > 60:
                rep.add("error", "distance-range", f"{b.id}->{other_id}",
                        f"walk distance {value} outside 0..60")
            back = sc.distances.get(other_id, {}).get(b.id)
            if back is not None and back != value:
                rep.add("error", "distance-asymmetry", f"{b.id}<->{other_id}",
                        f"walk distance {value} != reverse {back}")

    # -- programs / cohorts / degree maps -----------------------------------
    for p in sc.programs:
        for term_key, reqs in p.roadmap.items():
            try:
                term = int(term_key)
            except (TypeError, ValueError):
                rep.add("error", "bad-roadmap-term", p.id,
                        f"program {p.id} roadmap term {term_key!r} is not an integer")
                continue
            if term < 1 or term > 12:
                rep.add("error", "roadmap-term-range", p.id,
                        f"program {p.id} roadmap term {term} outside 1..12")
            course_ids = [r.course_id for r in reqs]
            for dup in _dupes(course_ids):
                rep.add("error", "duplicate-requirement", p.id,
                        f"program {p.id} term {term} repeats course {dup}")
            for req in reqs:
                if req.course_id not in courses:
                    rep.add("error", "dangling-requirement", p.id,
                            f"program {p.id} term {term} requires missing course {req.course_id}")
                if not req.required and (req.seat_estimate or 0) < 1:
                    rep.add("warning", "elective-without-takeup", p.id,
                            f"program {p.id} term {term} elective {req.course_id} "
                            "has no seat_estimate")
            if p.kind == "minor" or p.degree == "PhD":
                low, high = 1, 3
            else:
                low, high = 2, 6
            if not low <= len(reqs) <= high:
                rep.add("warning", "roadmap-load", p.id,
                        f"program {p.id} term {term} has {len(reqs)} courses "
                        "(a full-time load is 4-5)")

    for c in sc.cohorts:
        program = programs.get(c.program_id)
        if program is None:
            rep.add("error", "dangling-cohort-program", c.id,
                    f"cohort {c.id} points at missing program {c.program_id}")
            continue
        if c.size < 1:
            rep.add("error", "cohort-size", c.id, f"cohort {c.id} size {c.size} < 1")
        if not 1 <= c.credits_per_term <= 30:
            rep.add("error", "cohort-credits", c.id,
                    f"cohort {c.id} credits_per_term {c.credits_per_term} outside 1..30")
        if c.entry_term not in (1, 3, 5, 7):
            rep.add("warning", "cohort-entry-term", c.id,
                    f"cohort {c.id} enters in term {c.entry_term}; Fall intake is 1,3,5,7")
        if c.level == "phd" and c.entry_term != 1:
            rep.add("error", "phd-entry-term", c.id,
                    f"PhD cohort {c.id} must enter in a Fall term (1)")
        span = c.graduation_year - c.admission_year
        if c.level == "phd":
            low_span, high_span = 3, 7
        elif c.level == "master":
            low_span, high_span = 1, 3
        else:
            low_span, high_span = 3, 6
        if span < low_span or span > high_span:
            rep.add("warning", "degree-length", c.id,
                    f"cohort {c.id} ({c.level}) spans {span} years "
                    f"(expected {low_span}-{high_span})")
        total_terms = max(1, span * 2)
        if c.current_term < 1 or c.current_term > total_terms:
            rep.add("error", "term-progression", c.id,
                    f"cohort {c.id} current_term {c.current_term} outside 1..{total_terms}")
        # Fall intake: term 1 is the admission year, then +2 each fall.
        expected_term = 2 * (2026 - c.admission_year) + 1
        if c.current_term != expected_term:
            rep.add("warning", "term-year-mismatch", c.id,
                    f"cohort {c.id} term {c.current_term} does not match admission "
                    f"year {c.admission_year} (expected {expected_term})")
        plan = [r.course_id for r in program.roadmap.get(str(c.current_term), [])]
        if not plan:
            rep.add("error", "empty-term-plan", c.id,
                    f"cohort {c.id} is in term {c.current_term} but {program.id} "
                    "has no courses for that term")
        elif len(plan) < (1 if c.level == "phd" else 2 if c.level == "master" else 3):
            rep.add("warning", "thin-term-plan", c.id,
                    f"cohort {c.id} ({c.level}) has only {len(plan)} course(s) "
                    f"in term {c.current_term}")
        for cid in plan:
            if cid not in courses:
                continue
            if not sc.sections_of_course(cid):
                rep.add("error", "unoffered-plan-course", c.id,
                        f"cohort {c.id} needs {cid} this term but it has no section")

    for p in sc.programs:
        if p.kind == "minor":
            continue  # minors are completed alongside a major; no own cohorts
        if not any(c.program_id == p.id for c in sc.cohorts):
            rep.add("warning", "program-without-cohorts", p.id,
                    f"major program {p.id} has no active cohort")

    # -- demand / offering / capacity --------------------------------------
    demand_by_course: dict[str, int] = defaultdict(int)
    for c in sc.cohorts:
        program = programs.get(c.program_id)
        if program is None:
            continue
        for req in program.roadmap.get(str(c.current_term), []):
            demand_by_course[req.course_id] += (
                c.size if req.required else (req.seat_estimate or int(c.size * 0.4)))

    qualified = Counter()
    for i in sc.instructors:
        for cid in set(i.qualified_courses):
            qualified[cid] += 1

    total_capacity = sum(i.max_sections for i in sc.instructors)
    if total_capacity < len(sc.sections):
        rep.add("error", "faculty-capacity", "instructors",
                f"{len(sc.sections)} sections exceed total faculty capacity "
                f"{total_capacity}")
    total_load = sum(sc.section_load_units(s) for s in sc.sections)
    total_load_capacity = sum(sc.instructor_load_cap(i) for i in sc.instructors)
    if total_load_capacity < total_load:
        rep.add("error", "student-load-capacity", "instructors",
                f"section load {total_load:.1f} exceeds total student-load "
                f"capacity {total_load_capacity:.1f}")

    room_types = Counter(r.room_type for r in sc.rooms)
    for rtype in ("lecture", "lab", "seminar"):
        if room_types.get(rtype, 0) == 0:
            rep.add("warning", "missing-room-type", rtype, f"no {rtype} rooms on campus")

    for course in sc.courses:
        course_sections = sc.sections_of_course(course.id)
        demand = demand_by_course.get(course.id, 0)
        if not course_sections:
            if demand:
                rep.add("error", "unoffered-demand", course.id,
                        f"{course.code} has demand {demand} but no section")
            continue

        if qualified[course.id] < 2:
            rep.add("error", "single-point-of-failure", course.id,
                    f"{course.code} has {qualified[course.id]} qualified instructor(s); "
                    "one illness cancels the course")

        capacity = course.seats * len(course_sections)
        if demand > capacity:
            rep.add("error", "under-offered", course.id,
                    f"{course.code} demand {demand} exceeds {len(course_sections)} "
                    f"section(s) x {course.seats} seats = {capacity} (C5)")
        for section in course_sections:
            enrollment = sc.enrollment_for_section(section)
            if enrollment > course.seats:
                rep.add("error", "enrollment-above-seats", section.id,
                        f"{section.id} enrollment {enrollment} > course seats {course.seats}")
            fitting = [
                r for r in sc.rooms
                if r.room_type == course.room_type
                and r.capacity >= enrollment
                and set(course.equipment) <= set(r.equipment)
            ]
            if not fitting:
                rep.add("error", "no-fitting-room", section.id,
                        f"{section.id} ({course.code}, enrollment {enrollment}) has no "
                        "room with the right type, capacity and equipment")
            elif len(fitting) < 2:
                rep.add("warning", "single-room-option", section.id,
                        f"{section.id} can only use room {fitting[0].id}")

    # -- blackouts / closures / active enrollment --------------------------
    for b in sc.room_blackouts:
        if b.room_id not in rooms:
            rep.add("error", "dangling-blackout", b.room_id,
                    f"blackout points at missing room {b.room_id}")
        if b.period is not None and not 0 <= b.period < PERIOD_COUNT:
            rep.add("error", "bad-blackout", b.room_id, "blackout period out of range")
    for c in sc.closures:
        if not 0 <= c.day <= 4:
            rep.add("error", "bad-closure", c.label, "closure day out of range")
        if c.period is not None and not 0 <= c.period < PERIOD_COUNT:
            rep.add("error", "bad-closure", c.label, "closure period out of range")
    for sid, value in sc.active_enrollment.items():
        if sid not in sections:
            rep.add("error", "dangling-enrollment", sid,
                    f"active enrollment for missing section {sid}")
        elif value < 0:
            rep.add("error", "negative-enrollment", sid, f"{sid} enrollment {value} < 0")

    # -- catalog decisions / students / PhD reservations -------------------
    for record in sc.course_offerings:
        if record.course_id not in courses:
            rep.add("error", "dangling-offering", record.course_id,
                    f"offering record points at missing course {record.course_id}")
            continue
        if record.status in ("not_offered", "dormant") and sc.sections_of_course(record.course_id):
            rep.add("warning", "offering-still-scheduled", record.course_id,
                    f"{record.course_id} is {record.status} but still has sections")
        if record.status == "offered" and not sc.sections_of_course(record.course_id):
            rep.add("warning", "offered-without-section", record.course_id,
                    f"{record.course_id} is offered but has no section")

    for dup in _dupes([s.id for s in sc.students]):
        rep.add("error", "duplicate-student", dup, f"duplicate student id {dup!r}")
    for student in sc.students:
        if student.program_id not in programs:
            rep.add("error", "dangling-student-program", student.id,
                    f"student {student.id} points at missing program {student.program_id}")
        if student.cohort_id is not None and student.cohort_id not in cohorts:
            rep.add("error", "dangling-student-cohort", student.id,
                    f"student {student.id} points at missing cohort {student.cohort_id}")
        if student.cohort_id and student.cohort_id in cohorts:
            cohort = cohorts[student.cohort_id]
            if cohort.level != student.level:
                rep.add("warning", "student-level-mismatch", student.id,
                        f"student {student.id} level {student.level} != cohort "
                        f"level {cohort.level}")
        if student.level not in ("bachelor", "master", "phd"):
            rep.add("error", "student-level", student.id,
                    f"student {student.id} has unknown level {student.level}")

    approved_by_prof: dict[tuple[str, str], int] = defaultdict(int)
    for reservation in sc.phd_reservations:
        if reservation.student_id not in {s.id for s in sc.students}:
            rep.add("error", "dangling-phd-student", reservation.id,
                    f"reservation {reservation.id} points at missing student")
        if reservation.instructor_id not in instructors:
            rep.add("error", "dangling-phd-instructor", reservation.id,
                    f"reservation {reservation.id} points at missing instructor")
        if reservation.course_id not in courses:
            rep.add("error", "dangling-phd-course", reservation.id,
                    f"reservation {reservation.id} points at missing course")
        if not sc.policy.phd_min_credits <= reservation.credits <= sc.policy.phd_max_credits:
            rep.add("error", "phd-credits", reservation.id,
                    f"reservation {reservation.id} credits {reservation.credits} "
                    f"outside {sc.policy.phd_min_credits}-{sc.policy.phd_max_credits}")
        if reservation.status == "approved":
            key = (reservation.instructor_id, reservation.term)
            approved_by_prof[key] += 1
    for (instructor_id, term), count in approved_by_prof.items():
        instructor = instructors.get(instructor_id)
        cap = min(instructor.max_phd_students if instructor else 0,
                  sc.policy.phd_max_students_per_fall)
        if count > cap:
            rep.add("error", "phd-intake-over-cap", instructor_id,
                    f"{instructor_id} has {count} approved PhD students in {term} "
                    f"(cap {cap})")

    # -- "looks synthetic" warnings ----------------------------------------
    if len(sc.instructors) >= 8:
        caps = Counter(i.max_sections for i in sc.instructors)
        if len(caps) == 1:
            rep.add("warning", "uniform-load-caps", "instructors",
                    f"every instructor has max_sections={next(iter(caps))}; "
                    "real departments mix teaching and research loads")
        preps = Counter(i.max_preps for i in sc.instructors)
        if len(preps) == 1:
            rep.add("warning", "uniform-prep-caps", "instructors",
                    f"every instructor has max_preps={next(iter(preps))}")
    if len(sc.cohorts) >= 8:
        sizes = Counter(c.size for c in sc.cohorts)
        if len(sizes) <= 2:
            rep.add("warning", "uniform-cohort-sizes", "cohorts",
                    f"cohort sizes take only {len(sizes)} distinct value(s)")
    if len(sc.courses) >= 20:
        seats = Counter(c.seats for c in sc.courses)
        if seats.most_common(1)[0][1] > len(sc.courses) * 0.6:
            rep.add("warning", "uniform-seats", "courses",
                    f"{seats.most_common(1)[0][1]}/{len(sc.courses)} courses share "
                    f"the same seat cap ({seats.most_common(1)[0][0]})")

    return rep


def assert_realistic(sc: Scenario) -> AuditReport:
    """Raise AssertionError with the error list when the scenario is not sane."""
    report = audit_scenario(sc)
    if not report.ok:
        detail = "\n".join(f"  [{i.code}] {i.entity}: {i.message}" for i in report.errors)
        raise AssertionError(f"{sc.name} failed the realism audit:\n{detail}")
    return report
