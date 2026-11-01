"""Apply verified requests to the durable scenario ("the term as it now is").

The co-pilot is a proposal engine: it parses, solves, and proves. This module
is the explicit commit step — after a coordinator accepts a proposal, the
world state changes so every later solve builds on it instead of silently
reverting to the seed.

Pure by construction: callers get a deep copy back and decide when to publish
it. That keeps the demo beats independent while the UI can still commit.
"""

from __future__ import annotations

from app.models.scenario import (
    InstructorPreference,
    Operation,
    RoomBlackout,
    Scenario,
    SlotRef,
    TermClosure,
    PERIOD_COUNT,
)


def _slots(day: int | None, period: int | None) -> list[SlotRef]:
    """Expand a day/period request into concrete (day, period) slots."""
    if day is not None and period is not None:
        return [SlotRef(day=day, period=period)]
    if day is not None:
        return [SlotRef(day=day, period=p) for p in range(PERIOD_COUNT)]
    if period is not None:
        return [SlotRef(day=d, period=period) for d in range(5)]
    return []


def apply_operations(scenario: Scenario, operations: list[Operation]) -> Scenario:
    """Return a deep copy of `scenario` with every valid operation committed."""
    sc = scenario.model_copy(deep=True)

    for op in operations:
        if op.op == "remove_instructor" and op.instructor_id:
            removed = op.instructor_id
            sc.instructors = [i for i in sc.instructors if i.id != removed]
            sc.instructor_pins = {k: v for k, v in sc.instructor_pins.items() if v != removed}
            continue

        if op.op == "add_instructor_unavailability" and op.instructor_id:
            try:
                inst = sc.instructor(op.instructor_id)
            except StopIteration:
                continue
            existing = {(s.day, s.period) for s in inst.hard_unavailable}
            for slot in _slots(op.day, op.period):
                if (slot.day, slot.period) not in existing:
                    inst.hard_unavailable.append(slot)
                    existing.add((slot.day, slot.period))
            continue

        if op.op == "add_instructor_preference" and op.instructor_id:
            try:
                inst = sc.instructor(op.instructor_id)
            except StopIteration:
                continue
            inst.preferences.append(InstructorPreference(
                kind=op.kind or "avoid", day=op.day, period=op.period,
                course_id=op.course_id, weight=op.weight or 10))
            continue

        if op.op == "add_room_unavailability" and op.room_id:
            if not any(r.id == op.room_id for r in sc.rooms):
                continue
            existing = {(b.room_id, b.day, b.period) for b in sc.room_blackouts}
            days = [op.day] if op.day is not None else list(range(5))
            for day in days:
                key = (op.room_id, day, op.period)
                if key not in existing:
                    sc.room_blackouts.append(RoomBlackout(
                        room_id=op.room_id, day=day, period=op.period))
                    existing.add(key)
            continue

        if op.op == "add_term_closure" and (op.day is not None or op.period is not None):
            days = [op.day] if op.day is not None else list(range(5))
            for day in days:
                closure = TermClosure(day=day, period=op.period,
                                      label=op.label or "Closure")
                if closure not in sc.closures:
                    sc.closures.append(closure)
            continue

        if op.op == "set_section_instructor" and op.section_id and op.instructor_id:
            if any(s.id == op.section_id for s in sc.sections) and any(
                    i.id == op.instructor_id for i in sc.instructors):
                sc.instructor_pins[op.section_id] = op.instructor_id
            continue

        if op.op == "set_section_room" and op.section_id and op.room_id:
            if any(s.id == op.section_id for s in sc.sections) and any(
                    r.id == op.room_id for r in sc.rooms):
                sc.room_pins[op.section_id] = op.room_id
            continue

        if op.op in ("set_prep_cap", "set_load_cap") and op.instructor_id and op.value is not None:
            try:
                inst = sc.instructor(op.instructor_id)
            except StopIteration:
                continue
            if op.op == "set_prep_cap":
                inst.max_preps = max(0, op.value)
            else:
                inst.max_sections = max(0, op.value)
            continue

        if op.op == "update_enrollment" and op.section_id and op.value is not None:
            if any(s.id == op.section_id for s in sc.sections):
                sc.active_enrollment[op.section_id] = max(0, op.value)

    return sc
