"""Institution-data conflicts and change detection.

Two jobs, both deterministic (the LLM extracts; this layer audits):

- `detect_conflicts` finds records that disagree — duplicate course codes,
  rooms, instructors or cohorts; degree-map requirements with no catalog
  course; cohorts with no degree map; conflicting walk times — and returns
  the competing sources plus the choices the user can make.
- `diff_data` compares the previous extraction with the new one and returns a
  plain-language change report, including "No change detected" when the
  incoming data matches what the system already has.
"""

from __future__ import annotations

import re
from typing import Any

from app.models.ingestion import (
    ChangeReport,
    ConflictOption,
    DataChange,
    ExtractedCohort,
    ExtractedCourse,
    ExtractedDistance,
    ExtractedInstructor,
    ExtractedRequirement,
    ExtractedRoom,
    InstitutionData,
    InstitutionConflict,
)


def _key(value: str | None) -> str:
    return re.sub(r"\s+", "", (value or "").lower())


def _source(item: Any, fallback: str) -> str:
    return (getattr(item, "source", "") or fallback).strip()


def _course_desc(c: ExtractedCourse) -> str:
    return f"{c.code} — {c.title or '(untitled)'} ({c.pattern}, {c.room_type}, {c.seats} seats)"


def _instructor_desc(i: ExtractedInstructor) -> str:
    quals = ", ".join(i.qualified_courses) or "no courses"
    return f"{i.name} — {quals}; max {i.max_sections} sections / {i.max_preps} preps"


def _room_desc(r: ExtractedRoom) -> str:
    building = f" in {r.building}" if r.building else ""
    return f"{r.name}{building} — {r.capacity} seats, {r.room_type}"


def _cohort_desc(c: ExtractedCohort) -> str:
    return (
        f"{c.name or '(unnamed cohort)'} — {c.program or 'no program'}, "
        f"term {c.current_term}, {c.size} students"
    )


def _requirement_desc(r: ExtractedRequirement) -> str:
    kind = "required" if r.required else "elective"
    return f"{r.program or '(no program)'} term {r.term}: {r.course} ({kind})"


def _distance_desc(d: ExtractedDistance) -> str:
    return f"{d.from_building} ↔ {d.to_building}: {d.minutes} min"


def _signature(item: Any) -> tuple:
    if isinstance(item, ExtractedCourse):
        return (item.title, item.pattern, item.room_type, item.seats, tuple(item.equipment))
    if isinstance(item, ExtractedInstructor):
        return (tuple(item.qualified_courses), item.max_sections, item.max_preps, item.availability)
    if isinstance(item, ExtractedRoom):
        return (item.building, item.capacity, item.room_type, tuple(item.equipment))
    if isinstance(item, ExtractedCohort):
        return (item.program, item.admission_year, item.graduation_year, item.current_term, item.size)
    if isinstance(item, ExtractedRequirement):
        return (item.required,)
    if isinstance(item, ExtractedDistance):
        return (item.minutes,)
    return ()


def _duplicate_conflicts(
    data: InstitutionData,
    entity: str,
    items: list[Any],
    key_of,
    describe,
    label: str,
    fallback_source: str,
) -> list[InstitutionConflict]:
    groups: dict[str, list[tuple[int, Any]]] = {}
    for index, item in enumerate(items):
        groups.setdefault(key_of(item), []).append((index, item))

    conflicts: list[InstitutionConflict] = []
    for key, group in groups.items():
        if len(group) < 2:
            continue
        if len({_signature(item) for _, item in group}) <= 1:
            continue
        key_text = " ↔ ".join(key) if isinstance(key, tuple) else str(key)
        indices = [index for index, _ in group]
        sources = [
            f"{_source(item, fallback_source)} — {describe(item)}"
            for _, item in group
        ]
        options = [
            ConflictOption(
                key=f"keep_{index}",
                label=f"Use {_source(item, fallback_source)}: {describe(item)}",
                detail="Keep this record and drop the competing copy.",
            )
            for index, item in group
        ]
        conflicts.append(InstitutionConflict(
            id=f"{entity}-{_key(key_text) or len(conflicts)}",
            kind="duplicate",
            entity=entity,
            summary=f"{label} {key_text} appears {len(group)} times with different details.",
            detail="Pick the record that should win; the competing copies are removed.",
            sources=sources,
            indices=indices,
            options=options,
            default_option=options[0].key,
        ))
    return conflicts


def detect_conflicts(data: InstitutionData) -> list[InstitutionConflict]:
    """Every disagreement worth asking the user about, with its sources."""
    conflicts: list[InstitutionConflict] = []
    conflicts.extend(_duplicate_conflicts(
        data, "courses", data.courses, lambda c: _key(c.code),
        _course_desc, "Course", "course catalog"))
    conflicts.extend(_duplicate_conflicts(
        data, "instructors", data.instructors, lambda i: _key(i.name),
        _instructor_desc, "Instructor", "faculty roster"))
    conflicts.extend(_duplicate_conflicts(
        data, "rooms", data.rooms, lambda r: _key(r.name),
        _room_desc, "Room", "facilities"))
    conflicts.extend(_duplicate_conflicts(
        data, "cohorts", data.cohorts, lambda c: _key(c.name),
        _cohort_desc, "Cohort", "student bodies"))
    conflicts.extend(_duplicate_conflicts(
        data, "distances", data.distances,
        lambda d: tuple(sorted((_key(d.from_building), _key(d.to_building)))),
        _distance_desc, "Walk time", "campus map"))

    # Degree-map requirements with no catalog course.
    catalog = {_key(c.code) for c in data.courses}
    missing: dict[str, list[tuple[int, ExtractedRequirement]]] = {}
    for index, req in enumerate(data.degree_map):
        if _key(req.course) and _key(req.course) not in catalog:
            missing.setdefault(_key(req.course), []).append((index, req))
    for key, group in missing.items():
        indices = [index for index, _ in group]
        conflicts.append(InstitutionConflict(
            id=f"degree-map-missing-{key}",
            kind="missing-course",
            entity="degree_map",
            summary=f"Degree map references {group[0][1].course}, but no catalog record exists.",
            detail="Keep the requirement as a note, or drop it from the degree map.",
            sources=[
                f"{_source(req, 'degree map')} — {_requirement_desc(req)}"
                for _, req in group
            ],
            indices=indices,
            options=[
                ConflictOption(
                    key="keep_requirement",
                    label="Keep the requirement",
                    detail="It stays in the map but is skipped until the course is added.",
                ),
                ConflictOption(
                    key="drop_requirement",
                    label="Drop the requirement",
                    detail="Remove it from the degree map.",
                ),
            ],
            default_option="keep_requirement",
        ))

    # Cohorts whose program has no degree map.
    programs = {req.program.strip().lower() for req in data.degree_map if req.program}
    for index, cohort in enumerate(data.cohorts):
        program = (cohort.program or "").strip().lower()
        if program and program not in programs:
            conflicts.append(InstitutionConflict(
                id=f"cohort-no-degree-map-{index}",
                kind="missing-degree-map",
                entity="cohorts",
                summary=(
                    f"Cohort {cohort.name or index} has program "
                    f"{cohort.program}, but no degree map exists for it."
                ),
                detail="Keep the cohort with an empty roadmap, or drop the cohort.",
                sources=[f"{_source(cohort, 'student bodies')} — {_cohort_desc(cohort)}"],
                indices=[index],
                options=[
                    ConflictOption(
                        key="keep_cohort",
                        label="Keep the cohort",
                        detail="The cohort is kept; its program has no roadmap yet.",
                    ),
                    ConflictOption(
                        key="drop_cohort",
                        label="Drop the cohort",
                        detail="Remove the cohort from this import.",
                    ),
                ],
                default_option="keep_cohort",
            ))

    return conflicts


def resolve_conflicts(
    data: InstitutionData, resolutions: dict[str, str]
) -> InstitutionData:
    """Apply the user's elected winners to an extraction, in one pass.

    `resolutions` maps conflict id -> option key, exactly as returned by
    `detect_conflicts` for *this* data. All losing indices are collected
    first and dropped in a single filter per entity, so electing one winner
    can never shift the indices of the next conflict. Unknown conflict ids
    (e.g. a data set that was already resolved) are ignored; an unknown
    option key for a live conflict raises ValueError.
    """
    if not resolutions:
        return data
    live = {c.id: c for c in detect_conflicts(data)}
    drop: dict[str, set[int]] = {}
    for conflict_id, option_key in resolutions.items():
        conflict = live.get(conflict_id)
        if conflict is None:
            continue
        valid = {o.key for o in conflict.options}
        if option_key not in valid:
            raise ValueError(
                f"option {option_key!r} is not a choice for conflict "
                f"{conflict_id!r} (choose one of {sorted(valid)})")
        keep = re.fullmatch(r"keep_(\d+)", option_key)
        if keep:
            winner = int(keep.group(1))
            drop.setdefault(conflict.entity, set()).update(
                i for i in conflict.indices if i != winner)
        elif option_key == "drop_requirement":
            drop.setdefault("degree_map", set()).update(conflict.indices)
        elif option_key == "drop_cohort":
            drop.setdefault("cohorts", set()).update(conflict.indices)
        # keep_requirement / keep_cohort: the record stays; nothing to drop.
    if not drop:
        return data
    resolved = data.model_copy(deep=True)
    for entity, indices in drop.items():
        kept = [item for i, item in enumerate(getattr(resolved, entity))
                if i not in indices]
        setattr(resolved, entity, kept)
    return resolved


# --- change report ----------------------------------------------------------


def _map_by(items: list[Any], key_of) -> dict[Any, Any]:
    return {key_of(item): item for item in items}


def _diff_entity(
    previous: list[Any],
    current: list[Any],
    entity: str,
    key_of,
    describe,
) -> list[DataChange]:
    before = _map_by(previous, key_of)
    after = _map_by(current, key_of)
    changes: list[DataChange] = []
    for key in sorted(set(after) - set(before), key=str):
        changes.append(DataChange(kind="added", entity=entity, key=str(key),
                                  detail=describe(after[key])))
    for key in sorted(set(before) - set(after), key=str):
        changes.append(DataChange(kind="removed", entity=entity, key=str(key),
                                  detail=describe(before[key])))
    for key in sorted(set(before) & set(after), key=str):
        if _signature(before[key]) != _signature(after[key]):
            changes.append(DataChange(kind="updated", entity=entity, key=str(key),
                                      detail=f"{describe(before[key])} → {describe(after[key])}"))
    return changes


def _summarize(changes: list[DataChange]) -> str:
    if not changes:
        return "No change detected — the incoming data matches the current model."
    counts: dict[tuple[str, str], int] = {}
    for change in changes:
        counts[(change.kind, change.entity)] = counts.get((change.kind, change.entity), 0) + 1
    parts = [f"{count} {entity} {kind}" for (kind, entity), count in sorted(counts.items())]
    return f"Recognized {len(changes)} change(s): " + ", ".join(parts) + "."


def diff_data(
    previous: InstitutionData | None,
    current: InstitutionData,
) -> ChangeReport:
    """Plain-language change report between two extractions."""
    if previous is None:
        return ChangeReport(
            initial=True,
            summary=(
                f"Initial import: {len(current.courses)} courses, "
                f"{len(current.instructors)} instructors, {len(current.rooms)} rooms, "
                f"{len(current.cohorts)} cohorts, {len(current.degree_map)} degree-map entries."
            ),
        )

    changes: list[DataChange] = []
    changes.extend(_diff_entity(previous.courses, current.courses, "course",
                                lambda c: _key(c.code), _course_desc))
    changes.extend(_diff_entity(previous.instructors, current.instructors, "instructor",
                                lambda i: _key(i.name), _instructor_desc))
    changes.extend(_diff_entity(previous.rooms, current.rooms, "room",
                                lambda r: _key(r.name), _room_desc))
    changes.extend(_diff_entity(previous.cohorts, current.cohorts, "cohort",
                                lambda c: _key(c.name), _cohort_desc))
    changes.extend(_diff_entity(previous.degree_map, current.degree_map, "degree-map entry",
                                lambda r: (r.program, r.term, _key(r.course)),
                                _requirement_desc))
    changes.extend(_diff_entity(previous.distances, current.distances, "walk time",
                                lambda d: tuple(sorted((_key(d.from_building), _key(d.to_building)))),
                                _distance_desc))

    before_buildings = {b.strip().lower() for b in previous.buildings if b.strip()}
    after_buildings = {b.strip().lower() for b in current.buildings if b.strip()}
    for building in sorted(after_buildings - before_buildings):
        changes.append(DataChange(kind="added", entity="building", key=building))
    for building in sorted(before_buildings - after_buildings):
        changes.append(DataChange(kind="removed", entity="building", key=building))

    summary = _summarize(changes)
    return ChangeReport(
        changes=changes,
        unchanged=not changes,
        summary=summary,
    )
