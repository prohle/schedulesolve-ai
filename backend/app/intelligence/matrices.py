"""Sparse matrix builders: every scheduling entity becomes a matrix.

Six matrices + two masks, all scipy CSR (see sparse.py):

  classroom            rooms x courses     value = seat headroom (cap - enrollment),
                                           entry exists iff the room may host the
                                           course (C24 capacity, C25 type, C34 equipment)
  fulfilment           cohorts x courses   value = depth-before-completion:
                                           0 = current term plan, k>0 = a future
                                           roadmap course whose prerequisite chain
                                           is closed (all earlier courses completed
                                           or co-enrolled) — "how deep until done"
  demand               cohorts x courses   value = projected enrollment (cohort
                                           size for required, seat estimate for
                                           electives) — the C5 offering driver
  cohort_sections      cohorts x sections  1 = takeable by this cohort this term
  faculty_availability instructors x 20    1 = free at that (day, period)
  faculty_blackouts    instructors x 20    1 = hard blackout (C14)
  faculty_preferences  instructors x 20    signed soft weight (+avoid / -prefer)
  qualification        instructors x courses 1 = qualified (C13)

Stacking faculty_availability over the instructor axis yields the departmental
capacity heatmap C_Dept(d,t) = sum_p M_p(d,t) — dead zones fall out as zeros.
"""

from __future__ import annotations

from dataclasses import dataclass
from itertools import combinations
from typing import Iterable

import numpy as np

from app.models.intelligence import (
    CohortDepth,
    CohortMargin,
    FacultyLoad,
    MarginsReport,
    MatricesReport,
    RoomUtilization,
    UtilizationReport,
)
from app.models.results import Timetable
from app.models.scenario import (
    DAY_NAMES,
    PERIOD_COUNT,
    PERIOD_NAMES,
    Cohort,
    Program,
    Scenario,
    Section,
)
from app.intelligence.sparse import LabeledSparse

SLOT_LABELS = [f"{DAY_NAMES[d][:3]} {PERIOD_NAMES[p]}" for d in range(5) for p in range(PERIOD_COUNT)]


# --- degree depth model ------------------------------------------------------

def program_of(scenario: Scenario, cohort: Cohort) -> Program:
    return next(p for p in scenario.programs if p.id == cohort.program_id)


def course_depths(program: Program) -> dict[str, int]:
    """course_id -> earliest roadmap term it appears at (prerequisite depth)."""
    depths: dict[str, int] = {}
    for term, reqs in program.roadmap.items():
        for r in reqs:
            depths[r.course_id] = min(depths.get(r.course_id, 10**9), int(term))
    return depths


def total_terms(cohort: Cohort) -> int:
    """Two semesters per academic year: 'how long the journey is'."""
    return max(1, (cohort.graduation_year - cohort.admission_year) * 2)


def cohort_pool(scenario: Scenario, cohort: Cohort) -> tuple[list[str], list[str]]:
    """(plan_courses, pool_courses) for a cohort this term.

    plan  = the roadmap term the cohort currently sits in.
    pool  = plan + every future roadmap course whose prerequisite chain is
            closed (all strictly-earlier roadmap courses are completed or
            co-enrolled this term) + catalog courses not on the program
            roadmap at all (department-wide open electives).
    """
    program = program_of(scenario, cohort)
    depths = course_depths(program)
    term = cohort.current_term
    # The current-term plan is read directly from the roadmap (not from the
    # min-depth map) so an elective the registrar opens this term is eligible
    # even if the same course also appears earlier in the roadmap.
    plan = sorted(r.course_id for r in program.roadmap.get(str(term), []))
    pool = set(plan)
    for c, d in depths.items():
        if d > term and all(d2 <= term for d2 in depths.values() if d2 < d):
            pool.add(c)
    open_electives = {c.id for c in scenario.courses} - set(depths)
    pool |= open_electives
    return plan, sorted(pool)


def depth_rows(scenario: Scenario) -> list[CohortDepth]:
    rows: list[CohortDepth] = []
    for c in scenario.cohorts:
        plan, pool = cohort_pool(scenario, c)
        total = total_terms(c)
        rows.append(CohortDepth(
            cohort_id=c.id, name=c.name, size=c.size,
            current_term=c.current_term, total_terms=total,
            terms_remaining=total - c.current_term,
            completion_fraction=round(c.current_term / total, 3),
            plan_courses=plan, pool_courses=pool,
        ))
    return rows


# --- the matrices -------------------------------------------------------------

@dataclass
class IntelligenceBundle:
    classroom: LabeledSparse
    fulfilment: LabeledSparse
    demand: LabeledSparse
    cohort_sections: LabeledSparse
    faculty_availability: LabeledSparse
    faculty_blackouts: LabeledSparse
    faculty_preferences: LabeledSparse
    qualification: LabeledSparse
    depth: list[CohortDepth]

    def to_report(self) -> MatricesReport:
        def payload(name: str, m: LabeledSparse) -> dict:
            rows, cols, values = m.to_coo()
            return dict(
                name=name, shape=m.shape, row_labels=m.row_labels,
                col_labels=m.col_labels, rows=rows, cols=cols, values=values,
                nnz=m.nnz, density=m.density, notes=m.notes,
            )

        capacity = np.rint(
            self.faculty_availability.matrix.toarray().sum(axis=0)).astype(int)
        dead = [(i // 4, i % 4) for i in range(20) if capacity[i] == 0]
        return MatricesReport(
            **{k: payload(k, v) for k, v in vars(self).items()
               if isinstance(v, LabeledSparse)},
            department_capacity=[[int(capacity[d * PERIOD_COUNT + p]) for p in range(PERIOD_COUNT)]
                                 for d in range(5)],
            dead_zones=dead,
            depth=self.depth,
        )


def build_matrices(scenario: Scenario) -> IntelligenceBundle:
    room_labels = [r.id for r in scenario.rooms]
    course_labels = sorted(c.id for c in scenario.courses)
    course_ix = {c: i for i, c in enumerate(course_labels)}
    section_labels = [s.id for s in scenario.sections]
    section_ix = {s: i for i, s in enumerate(section_labels)}
    instructor_labels = [i.id for i in scenario.instructors]
    cohort_labels = [c.id for c in scenario.cohorts]

    # classroom: rooms x courses, value = seat headroom when fully compatible
    rows, cols, vals = [], [], []
    for ri, room in enumerate(scenario.rooms):
        for course in scenario.courses:
            if course.room_type != room.room_type:
                continue  # C25
            if not set(course.equipment) <= set(room.equipment):
                continue  # C34
            demand = sum(
                scenario.enrollment_for_section(s)
                for s in scenario.sections if s.course_id == course.id
            ) // max(1, len(scenario.sections_of_course(course.id)))
            if room.capacity >= demand:  # C24
                rows.append(ri)
                cols.append(course_ix[course.id])
                vals.append(room.capacity - demand)
    classroom = LabeledSparse.from_coo(
        (len(room_labels), len(course_labels)), rows, cols, vals,
        room_labels, course_labels,
        "value = capacity - per-section enrollment; entry exists iff C24+C25+C34 all hold")

    # cohort-level depth / demand / section eligibility
    f_rows, f_cols, f_vals = [], [], []
    d_rows, d_cols, d_vals = [], [], []
    s_rows, s_cols, s_vals = [], [], []
    depth = depth_rows(scenario)
    for ki, cohort in enumerate(scenario.cohorts):
        program = program_of(scenario, cohort)
        depths = course_depths(program)
        _, pool = cohort_pool(scenario, cohort)
        pool_ix = {course_ix[c] for c in pool if c in course_ix}
        for c in pool:
            if c not in course_ix:
                continue
            j = course_ix[c]
            f_rows.append(ki)
            f_cols.append(j)
            f_vals.append(float(depths.get(c, cohort.current_term)) - cohort.current_term)
            s_rows.extend([ki] * len(scenario.sections_of_course(c)))
            s_cols.extend(section_ix[s.id] for s in scenario.sections_of_course(c))
            s_vals.extend([1.0] * len(scenario.sections_of_course(c)))
        for req in program.roadmap.get(str(cohort.current_term), []):
            if req.course_id in course_ix:
                d_rows.append(ki)
                d_cols.append(course_ix[req.course_id])
                # elective take-up falls back to the C35 default (same as
                # enrollment_for_section) when no explicit estimate is given.
                if req.required:
                    demand = cohort.size
                else:
                    demand = req.seat_estimate or int(cohort.size * 0.4)
                d_vals.append(float(demand))
    fulfilment = LabeledSparse.from_coo(
        (len(cohort_labels), len(course_labels)), f_rows, f_cols, f_vals,
        cohort_labels, course_labels,
        "value = roadmap depth - current term (0 = taking now, k = k terms of chain left)")
    demand = LabeledSparse.from_coo(
        (len(cohort_labels), len(course_labels)), d_rows, d_cols, d_vals,
        cohort_labels, course_labels,
        "value = projected enrollment: cohort size (required) or seat estimate (elective)")
    cohort_sections = LabeledSparse.from_coo(
        (len(cohort_labels), len(section_labels)), s_rows, s_cols, s_vals,
        cohort_labels, section_labels, "1 = takeable by this cohort this term (C12)")

    # faculty: availability, hard blackouts, soft preferences, qualifications
    a_rows, a_cols, a_vals = [], [], []
    b_rows, b_cols, b_vals = [], [], []
    p_rows, p_cols, p_vals = [], [], []
    q_rows, q_cols, q_vals = [], [], []
    for pi, inst in enumerate(scenario.instructors):
        blocked = {(s.day, s.period) for s in inst.hard_unavailable}
        for d in range(5):
            for p in range(PERIOD_COUNT):
                slot = d * 4 + p
                if (d, p) in blocked:
                    b_rows.append(pi)
                    b_cols.append(slot)
                    b_vals.append(1.0)
                else:
                    a_rows.append(pi)
                    a_cols.append(slot)
                    a_vals.append(1.0)
        for pref in inst.preferences:
            if pref.day is None:
                days: Iterable[int] = range(5)
            else:
                days = [pref.day]
            if pref.period is None:
                periods: Iterable[int] = range(PERIOD_COUNT)
            else:
                periods = [pref.period]
            for d in days:
                for p in periods:
                    if (d, p) in blocked:
                        continue  # a soft note on a hard blackout is redundant
                    p_rows.append(pi)
                    p_cols.append(d * 4 + p)
                    p_vals.append(float(pref.weight if pref.kind == "avoid"
                                        else -pref.weight))
        for cid in sorted(inst.qualified_courses):
            if cid in course_ix:
                q_rows.append(pi)
                q_cols.append(course_ix[cid])
                q_vals.append(1.0)
    faculty_availability = LabeledSparse.from_coo(
        (len(instructor_labels), 20), a_rows, a_cols, a_vals,
        instructor_labels, SLOT_LABELS, "1 = free to teach (no C14 blackout)")
    faculty_blackouts = LabeledSparse.from_coo(
        (len(instructor_labels), 20), b_rows, b_cols, b_vals,
        instructor_labels, SLOT_LABELS, "1 = hard blackout (committee, research, off-day)")
    faculty_preferences = LabeledSparse.from_coo(
        (len(instructor_labels), 20), p_rows, p_cols, p_vals,
        instructor_labels, SLOT_LABELS, "+weight avoid / -weight prefer (C19)")
    qualification = LabeledSparse.from_coo(
        (len(instructor_labels), len(course_labels)), q_rows, q_cols, q_vals,
        instructor_labels, course_labels, "1 = qualified to teach (C13)")

    return IntelligenceBundle(
        classroom=classroom, fulfilment=fulfilment, demand=demand,
        cohort_sections=cohort_sections, faculty_availability=faculty_availability,
        faculty_blackouts=faculty_blackouts, faculty_preferences=faculty_preferences,
        qualification=qualification, depth=depth)


# --- C39: the four-course guarantee -------------------------------------------

def placement_intervals(placement) -> set[tuple[int, int]]:
    """(day, period) cells a placed section occupies."""
    return {(d, p) for d in placement.days for p in placement.periods}


def compute_margins(scenario: Scenario, timetable: Timetable | None,
                    min_courses: int) -> MarginsReport:
    """Audit the placed timetable: can every cohort assemble `min_courses`
    distinct, mutually non-overlapping courses (full-time status, C39)?

    Course-level flexibility: a student picks ONE section per course, so two
    courses conflict iff EVERY pair of their placed sections overlaps.
    """
    if timetable is None:
        return MarginsReport(min_courses=min_courses, cohorts=[], all_ok=False)
    by_course: dict[str, list[set[tuple[int, int]]]] = {}
    for pl in timetable.placements:
        by_course.setdefault(pl.course_id, []).append(placement_intervals(pl))

    def conflict(c1: str, c2: str) -> bool:
        return all(a & b for a in by_course.get(c1, []) for b in by_course.get(c2, []))

    cohorts: list = []
    depths = {d.cohort_id: d for d in depth_rows(scenario)}
    for c in scenario.cohorts:
        _, pool = cohort_pool(scenario, c)
        offered = sorted(x for x in pool if x in by_course)
        # exact max independent set for department-scale pools; greedy beyond
        margin, track = 0, []
        if offered:
            if len(offered) <= 16:
                for k in range(len(offered), 0, -1):
                    found = next(
                        (list(sel) for sel in combinations(offered, k)
                         if all(not conflict(a, b) for a, b in combinations(sel, 2))),
                        None)
                    if found:
                        margin, track = k, found
                        break
            else:
                order = sorted(offered, key=lambda x: (-len(by_course[x]), x))
                for c2 in order:
                    if all(not conflict(c2, t) for t in track):
                        track.append(c2)
                margin = len(track)
        name = next(x.name for x in scenario.cohorts if x.id == c.id)
        ok = margin >= min_courses
        shortfall = margin < min_courses
        cohorts.append(CohortMargin(
            cohort_id=c.id, name=name, size=c.size,
            terms_remaining=total_terms(c) - c.current_term,
            plan_courses=depths[c.id].plan_courses,
            pool_courses=pool, offered_pool_courses=offered,
            margin=margin, ok=ok, example_track=sorted(track),
            risk=("on track" if ok else
                  f"degree delay risk: only {margin} of {min_courses} required "
                  f"non-conflicting courses fit the placed timetable")))
    return MarginsReport(min_courses=min_courses, cohorts=cohorts,
                         all_ok=all(c.ok for c in cohorts))


def compute_utilization(scenario: Scenario, timetable: Timetable | None) -> UtilizationReport:
    """Campus + faculty utilization against a placed timetable.

    Room utilization = scheduled seats / room capacity (C24's complement);
    faculty utilization = assigned sections / max_sections (C15's complement).
    """
    placements = timetable.placements if timetable else []
    loads = timetable.sections_per_instructor if timetable else {}

    rooms: list[RoomUtilization] = []
    total_cap = 0
    total_peak = 0
    for room in scenario.rooms:
        placed = [p for p in placements if p.room_id == room.id]
        # a room hosts one section per slot (C23); peak = its busiest booking
        peak = max((scenario.enrollment_for_section(scenario.section_by_id(p.section_id))
                    for p in placed), default=0)
        total_cap += room.capacity
        total_peak += peak
        rooms.append(RoomUtilization(
            room_id=room.id, name=room.name, capacity=room.capacity,
            peak_seats=peak,
            utilization=round(peak / room.capacity, 3) if room.capacity else 0.0,
        ))

    faculty: list[FacultyLoad] = []
    for inst in scenario.instructors:
        load = loads.get(inst.id, 0)
        faculty.append(FacultyLoad(
            instructor_id=inst.id, name=inst.name, load=load,
            max_sections=inst.max_sections, satisfied=load <= inst.max_sections,
            utilization=round(load / inst.max_sections, 3) if inst.max_sections else 0.0,
        ))

    return UtilizationReport(
        room_utilization=round(total_peak / total_cap, 3) if total_cap else 0.0,
        rooms=rooms, faculty=faculty, all_loads_met=all(f.satisfied for f in faculty))
