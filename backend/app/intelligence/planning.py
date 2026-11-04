"""What-if capacity planning: preview future growth and repurposing.

`whatif(scenario, change_id)` applies a hypothetical change to a copy of the
scenario, re-solves, and compares before/after feasibility, utilization, loads
and the C39 four-course margins — so a coordinator can answer "what if we build
a new lab?", "what if enrollment grows 20%?", "what if we repurpose a hall?"
with numbers, not guesses.
"""

from __future__ import annotations

from app import config
from app.intelligence.matrices import compute_margins, compute_utilization
from app.models.intelligence import WhatIfReport
from app.models.scenario import Room, Scenario
from app.solver.scheduling_model import solve

# Built-in scenarios. Each returns the mutated scenario.
CHANGES: list[dict] = [
    {
        "id": "add_lab",
        "label": "Build a new computer lab",
        "description": "Add a 35-seat computer lab and re-solve.",
        "apply": lambda sc: _add_room(sc, "new-lab", "New Computer Lab", "lab", 35, ["computers"]),
    },
    {
        "id": "grow_enrollment",
        "label": "Enrollment grows 20%",
        "description": "Every cohort grows 20% — does the campus still fit them?",
        "apply": lambda sc: _grow(sc, 1.2),
    },
    {
        "id": "repurpose_hall",
        "label": "Repurpose a lecture hall into a lab",
        "description": "Convert the largest lecture room into a computer lab.",
        "apply": lambda sc: _repurpose(sc),
    },
]


def _add_room(sc: Scenario, rid: str, name: str, room_type: str, capacity: int, equipment: list[str]) -> Scenario:
    sc = sc.model_copy(deep=True)
    building = sc.buildings[0].id if sc.buildings else "main"
    sc.rooms.append(Room(id=rid, name=name, building_id=building,
                         capacity=capacity, room_type=room_type, equipment=equipment))
    return sc


def _grow(sc: Scenario, factor: float) -> Scenario:
    sc = sc.model_copy(deep=True)
    for c in sc.cohorts:
        c.size = max(1, int(c.size * factor))
    return sc


def _repurpose(sc: Scenario) -> Scenario:
    sc = sc.model_copy(deep=True)
    lec = max((r for r in sc.rooms if r.room_type == "lecture"),
              key=lambda r: r.capacity, default=None)
    if lec is not None:
        lec.room_type = "lab"
        lec.equipment = list(dict.fromkeys(lec.equipment + ["computers"]))
    return sc


def _verdict(change_id: str, before, after, bu, au, bm, am) -> str:
    b_status = before.status
    a_status = after.status
    if a_status not in ("optimal", "feasible"):
        # No timetable exists after the change, so utilisation and margins have
        # nothing to measure. Reporting "39% -> 0%" would read as a collapse in
        # usage rather than the truth: the term no longer fits at all.
        return (f"The change does not hold: the term goes {b_status} → {a_status}. "
                "With no feasible schedule there is no utilisation or four-course "
                "guarantee to compare — the honest answer is that this campus cannot "
                "absorb the change as specified.")
    if change_id == "add_lab":
        return ("The new lab gives the campus more lab capacity: "
                f"utilization {bu.room_utilization:.0%} → {au.room_utilization:.0%}, and the "
                f"schedule is {a_status} (was {b_status}).")
    if change_id == "grow_enrollment":
        fits = a_status in ("optimal", "feasible")
        return (f"With 20% more students the timetable {'still fits' if fits else 'NO LONGER fits'}. "
                f"Utilization {bu.room_utilization:.0%} → {au.room_utilization:.0%}; "
                f"four-course guarantee {'holds' if am.all_ok else 'breaks'}.")
    if change_id == "repurpose_hall":
        return ("The hall becomes lab capacity at the cost of lecture space: "
                f"utilization {bu.room_utilization:.0%} → {au.room_utilization:.0%}, "
                f"schedule {a_status} (was {b_status}).")
    return f"schedule {b_status} → {a_status}"


def whatif(scenario: Scenario, change_id: str) -> WhatIfReport:
    change = next((c for c in CHANGES if c["id"] == change_id), CHANGES[0])
    before = solve(scenario)
    mutated = change["apply"](scenario)
    after = solve(mutated)

    bu = compute_utilization(scenario, before.timetable)
    au = compute_utilization(mutated, after.timetable)
    bm = compute_margins(scenario, before.timetable, config.MIN_COURSES_PER_COHORT)
    am = compute_margins(mutated, after.timetable, config.MIN_COURSES_PER_COHORT)

    before_loads = before.timetable.sections_per_instructor if before.timetable else {}
    after_loads = after.timetable.sections_per_instructor if after.timetable else {}

    return WhatIfReport(
        change_id=change["id"], label=change["label"], description=change["description"],
        before_status=before.status, after_status=after.status,
        before_utilization=bu.room_utilization, after_utilization=au.room_utilization,
        before_loads=before_loads, after_loads=after_loads,
        before_margins_ok=bm.all_ok, after_margins_ok=am.all_ok,
        verdict=_verdict(change["id"], before, after, bu, au, bm, am),
    )