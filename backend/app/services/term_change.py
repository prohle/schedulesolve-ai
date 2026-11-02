"""Term changes: instructor changes effective through the end of the term.

A term change means the instructor will not teach again this term (not a
one-week absence): their sections must be reassigned for the rest of the
term. Room changes of the same duration (a hall withdrawn for the rest of
the term) enter through Intake as room unavailability, which the weekly
pattern model applies to every remaining week.

Flow: parse the term change ("Prof. Chen will no longer teach this term") -> solve the base
timetable -> identify affected sections -> `propose_candidates` (CP-SAT
probe per candidate: qualified ∩ load headroom ∩ zero-ripple feasibility)
-> auto-pick the best candidate per section -> re-solve -> report.

The proposals are the demo centerpiece: the LLM explains, the solver
verifies. No name is suggested that CP-SAT hasn't proven can cover.
"""

from __future__ import annotations

from app.models.results import AgentStep, TermChangeResponse, SolveResult
from app.models.scenario import Operation, Scenario
from app.parsing.parser import ConstraintParser, validate_operations
from app.services.audit import record_event, record_submission
from app.solver.scheduling_model import propose_candidates, solve


def run_term_change(
    scenario: Scenario,
    message: str,
    parser: ConstraintParser | None = None,
    elected: dict[str, str] | None = None,
) -> TermChangeResponse:
    """Rank verified coverage for a departing instructor.

    The best feasible candidate per section is the default (`chosen`), but
    the coordinator may elect any other *feasible* proposal per section via
    `elected` (section_id -> instructor_id). An election the solver did not
    prove feasible for that section raises ValueError — an unproven name is
    never silently substituted.
    """
    parser = parser or ConstraintParser()
    parsed = parser.parse(message, scenario)
    from app.services.copilot import stamp_sources
    stamp_sources(parsed.operations, scenario, None, message)
    record_submission(message, parsed.summary, parser.mode)  # type: ignore[arg-type]
    ops, notes = validate_operations(parsed.operations, scenario)
    muse = {"model": parser.model, "parser_latency_ms": parser.last_latency_ms}
    trace: list[AgentStep] = []
    actor = f"Muse Spark · {parser.model}" if parser.mode == "muse-spark" else "Deterministic mock parser"
    latency = f" in {parser.last_latency_ms} ms" if parser.last_latency_ms else ""
    trace.append(AgentStep(
        step="parse", actor=actor,
        detail=f"Parsed the term change into {len(parsed.operations)} typed operation(s){latency}: {parsed.summary}"))
    trace.append(AgentStep(
        step="validate", actor="Validator",
        detail=f"{len(ops)} operation(s) passed schema + scenario validation."))

    removed = next((o for o in ops if o.op == "remove_instructor" and o.instructor_id), None)
    if removed is None:
        # A term change often parses as full-term unavailability —
        # identical to a removal here: the weekly pattern applies to
        # every remaining week of the term, not a single week.
        removed = next((o for o in ops
                        if o.op == "add_instructor_unavailability"
                        and o.instructor_id
                        and o.day is None and o.period is None), None)
    if removed is None or not removed.instructor_id:
        trace.append(AgentStep(
            step="impact", actor="Agent", status="blocked",
            detail="No instructor removal found in the message — nothing to re-home."))
        return TermChangeResponse(
            removed_instructor_id="", removed_instructor_name="",
            affected_section_ids=[], proposals=[], chosen={}, healing_notes=
            ["No instructor term change found in the message."] + notes,
            result=None, parser_mode=parser.mode, agent_trace=trace, **muse,  # type: ignore[arg-type]
        )

    removed_id = removed.instructor_id
    base = solve(scenario)
    trace.append(AgentStep(
        step="solve", actor="CP-SAT",
        detail=f"Base timetable: {base.status} in {base.solve_time_ms} ms.",
        status="ok" if base.status != "infeasible" else "blocked"))
    if base.status == "infeasible" or base.timetable is None:
        return TermChangeResponse(
            removed_instructor_id=removed_id,
            removed_instructor_name=scenario.instructor(removed_id).name,
            affected_section_ids=[], proposals=[], chosen={},
            healing_notes=["Base timetable is already infeasible."] + notes,
            result=base, parser_mode=parser.mode, agent_trace=trace, **muse,  # type: ignore[arg-type]
        )

    affected_ids = [p.section_id for p in base.timetable.placements
                    if p.instructor_id == removed_id]
    record_event("term_change",
                 f"{scenario.instructor(removed_id).name} no longer teaching this term — {len(affected_ids)} section(s) affected",
                 {"instructor_id": removed_id, "sections": affected_ids})
    healing_notes = list(notes)
    healing_notes.append(
        f"Base timetable built ({base.status}, {base.solve_time_ms} ms) — "
        f"{len(affected_ids)} section(s) assigned to {scenario.instructor(removed_id).name}."
    )

    trace.append(AgentStep(
        step="impact", actor="Agent",
        detail=f"Impact analysis: {len(affected_ids)} section(s) were assigned to "
               f"{scenario.instructor(removed_id).name}: {', '.join(affected_ids) or 'none'}."))

    if not affected_ids:
        return TermChangeResponse(
            removed_instructor_id=removed_id,
            removed_instructor_name=scenario.instructor(removed_id).name,
            affected_section_ids=[], proposals=[], chosen={},
            healing_notes=healing_notes + ["That instructor had no sections to reassign."],
            result=base, parser_mode=parser.mode, agent_trace=trace, **muse,  # type: ignore[arg-type]
        )

    proposals = propose_candidates(scenario, base, removed_id)
    n_feasible = sum(1 for p in proposals if p.feasible)
    trace.append(AgentStep(
        step="probe", actor="CP-SAT",
        detail=f"Probed every qualified instructor per affected section: "
               f"{len(proposals)} candidate probe(s), {n_feasible} proven zero-ripple feasible."))

    # Default pick: best feasible candidate per affected section, tracking load.
    loads = dict(base.timetable.sections_per_instructor)
    chosen: dict[str, str] = {}
    for sid in affected_ids:
        best = next(
            (p for p in proposals
             if p.section_id == sid and p.feasible
             and loads.get(p.instructor_id, 0) + 1 <= scenario.instructor(p.instructor_id).max_sections),
            None,
        )
        if best is not None:
            chosen[sid] = best.instructor_id
            loads[best.instructor_id] = loads.get(best.instructor_id, 0) + 1
            healing_notes.append(
                f"{best.instructor_name} covers {best.course_code}: {best.reason}."
            )
        else:
            healing_notes.append(f"No verified candidate found for section {sid}; leaving it to re-solve freely.")

    # Coordinator election: any other solver-proven candidate may win a
    # section instead of the default. Unproven elections are refused, and
    # electing a second section to the same instructor re-checks the load.
    if elected:
        feasible = {(p.section_id, p.instructor_id) for p in proposals if p.feasible}
        for sid, iid in elected.items():
            if sid not in affected_ids:
                raise ValueError(f"Section {sid} is not affected by this term change.")
            if (sid, iid) not in feasible:
                name = next((i.name for i in scenario.instructors if i.id == iid), iid)
                raise ValueError(
                    f"{name} is not a solver-proven cover for {sid}; "
                    f"elect one of the feasible proposals for that section.")
        # Re-check caps with the elected set as a whole.
        counts: dict[str, int] = dict(base.timetable.sections_per_instructor)
        merged = {**chosen, **elected}
        for sid, iid in elected.items():
            previous = chosen.get(sid)
            if previous == iid:
                continue
            counts[iid] = counts.get(iid, 0) + 1
            if counts[iid] > scenario.instructor(iid).max_sections:
                raise ValueError(
                    f"Elected coverage puts {scenario.instructor(iid).name} over "
                    f"the {scenario.instructor(iid).max_sections}-section load cap; "
                    f"elect a different cover for one section.")
            if previous:
                counts[previous] = counts.get(previous, 0) - 1
        chosen = merged
        healing_notes.append(
            "Coordinator elected coverage: "
            + ", ".join(f"{sid} -> {scenario.instructor(iid).name}"
                        for sid, iid in elected.items()) + ".")

    # The absent instructor must be gone from the result, even for a section
    # with no verified candidate. Otherwise the "after" timetable quietly puts
    # them back on the board.
    remove_op = Operation(
        op="remove_instructor", instructor_id=removed_id,
        explanation=f"{scenario.instructor(removed_id).name} will no longer teach this term.")

    result: SolveResult | None = None
    if chosen:
        # Freeze every unaffected placement: the coverage swap must be
        # zero-ripple, not a global reshuffle. Only the affected sections may
        # move (and only if the candidate needs a different slot/room).
        pins_exact = {
            p.section_id: (p.instructor_id,
                           p.period if p.period is not None else p.days[0],
                           p.room_id)
            for p in base.timetable.placements
            if p.section_id not in affected_ids
        }
        result = solve(scenario, [remove_op],
                       instructor_pins=chosen, pins_exact=pins_exact)
        if result.status == "infeasible":
            healing_notes.append(
                "Zero-ripple coverage is not possible; re-solving the affected sections.")
            result = solve(scenario, [remove_op])
    else:
        result = solve(scenario, [remove_op])
    if result.status == "infeasible":
        healing_notes.append(
            "No verified coverage exists for every affected section — "
            "the request needs a structural change (new section, qualification, or load cap).")

    chosen_txt = ", ".join(
        f"{sid} -> {scenario.instructor(iid).name}" for sid, iid in chosen.items()) or "none"
    trace.append(AgentStep(
        step="choose",
        actor="Coordinator (elected)" if elected else "Agent (auto-pick)",
        detail=(f"Elected verified candidate per section: {chosen_txt}."
                if elected else
                f"Best verified candidate per section: {chosen_txt}.")))
    trace.append(AgentStep(
        step="re-solve", actor="CP-SAT",
        detail=f"Re-solved with {scenario.instructor(removed_id).name} removed and coverage pinned: "
               f"{result.status} in {result.solve_time_ms} ms.",
        status="ok" if result.status != "infeasible" else "blocked"))
    trace.append(AgentStep(
        step="audit", actor="Audit trail",
        detail="Term Change event recorded; applying it commits the removal and coverage pins to the term."))

    return TermChangeResponse(
        removed_instructor_id=removed_id,
        removed_instructor_name=scenario.instructor(removed_id).name,
        affected_section_ids=affected_ids,
        proposals=proposals,
        chosen=chosen,
        healing_notes=healing_notes,
        result=result,
        parser_mode=parser.mode, agent_trace=trace, **muse,  # type: ignore[arg-type]
    )
