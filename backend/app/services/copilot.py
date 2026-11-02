"""Co-pilot orchestration: parse -> validate -> solve -> Muse-explaind self-heal.

When the solver reports infeasibility, CP-SAT has already named the minimal
conflicting subset (assumption literals). The self-healing loop works in two
layers:

1. Muse Spark translates the proof into a plain-English explanation and ranks
   resolutions (each drops exactly one conflicting request).
2. CP-SAT verifies every proposed resolution by re-solving. Only verified
   options are shown; the least-disruptive one is auto-applied as the
   default, and the coordinator may elect any other verified option instead
   (each option carries the exact operations that would stand).

Every conflicting request is returned with the source it came from (who
submitted it, through which message), so the conflict can be identified
before a winner is elected. The LLM never decides feasibility; the solver
never talks to humans.
"""

from __future__ import annotations

from app.agent.explainer import ConflictExplainer
from app.models.results import (
    AgentStep,
    ConflictReport,
    CopilotResponse,
    ResolutionOption,
    SolveResult,
    operation_source,
)
from app.models.scenario import Operation, Scenario
from app.parsing.parser import ConstraintParser, validate_operations
from app.services.audit import record_event, record_submission
from app.solver.scheduling_model import solve

MAX_HEALING_ROUNDS = 5


def stamp_sources(ops: list[Operation], scenario: Scenario,
                  speaker_id: str | None, message: str) -> None:
    """Authoritative provenance for parsed operations, stamped by the
    backend — the model never gets to invent where a request came from."""
    speaker = next((i for i in scenario.instructors if i.id == speaker_id), None)
    excerpt = " ".join(message.split())[:120]
    for op in ops:
        if op.source:
            continue
        if speaker is not None:
            op.source = f"Intake message from {speaker.name} ({speaker.id}): “{excerpt}”"
        else:
            op.source = f"Coordinator's Intake message: “{excerpt}”"


def _verified_option(scenario: Scenario, remaining: list[Operation],
                     drop_index: int, tradeoff: str,
                     core: list[int]) -> ResolutionOption | None:
    """Re-solve without one conflicting request; an option exists only if
    the solver proves the remainder can stand."""
    if drop_index >= len(remaining):
        return None
    victim = remaining[drop_index]
    candidate_ops = [o for i, o in enumerate(remaining) if i != drop_index]
    verified = solve(scenario, candidate_ops)
    if verified.status == "infeasible":
        return None
    return ResolutionOption(
        dropped_operation_index=drop_index,
        dropped_explanation=victim.explanation,
        tradeoff=tradeoff,
        result=verified,
        source=operation_source(victim),
        sources=[operation_source(remaining[i]) for i in core],
        operations=candidate_ops,
    )


def run_copilot(
    scenario: Scenario,
    message: str,
    parser: ConstraintParser | None = None,
    explainr: ConflictExplainer | None = None,
    speaker_id: str | None = None,
) -> CopilotResponse:
    parser = parser or ConstraintParser()
    explainr = explainr or ConflictExplainer()
    parsed = parser.parse(message, scenario, speaker_id)
    stamp_sources(parsed.operations, scenario, speaker_id, message)
    record_submission(message, parsed.summary, parser.mode)  # type: ignore[arg-type]

    trace: list[AgentStep] = []
    actor = f"Muse Spark · {parser.model}" if parser.mode == "muse-spark" else "Deterministic mock parser"
    latency = f" in {parser.last_latency_ms} ms" if parser.last_latency_ms else ""
    trace.append(AgentStep(
        step="parse", actor=actor,
        detail=f"Parsed the message into {len(parsed.operations)} typed operation(s){latency}: {parsed.summary}"))

    ops, notes = validate_operations(parsed.operations, scenario)
    trace.append(AgentStep(
        step="validate", actor="Validator",
        detail=f"{len(ops)} operation(s) passed schema + scenario validation"
               + (f"; {len(notes)} note(s): {'; '.join(notes)}" if notes else "")))
    healing_notes = list(notes)

    remaining: list[Operation] = list(ops)
    dropped: list[Operation] = []
    options: list[ResolutionOption] = []
    explanation: str | None = None
    explanation_mode: str | None = None
    result: SolveResult | None = None
    first_conflict: ConflictReport | None = None
    applied_option_index: int | None = None

    for round_no in range(MAX_HEALING_ROUNDS):
        result = solve(scenario, remaining)
        trace.append(AgentStep(
            step="solve", actor="CP-SAT",
            detail=f"Solve attempt {round_no + 1} with {len(remaining)} operation(s): "
                   f"{result.status} in {result.solve_time_ms} ms",
            status="ok" if result.status != "infeasible" else "blocked"))
        if result.status != "infeasible":
            break

        conflict = result.conflicts
        if first_conflict is None:
            first_conflict = conflict
        if not conflict or not conflict.conflicting_operation_indices:
            trace.append(AgentStep(
                step="conflict-core", actor="CP-SAT", status="blocked",
                detail="Infeasible against the base scenario — no request operation is in the conflict core. "
                       "Source: the institution model itself, not a submitted request."))
            break  # base scenario infeasible — dropping requests won't help

        core = conflict.conflicting_operation_indices
        trace.append(AgentStep(
            step="conflict-core", actor="CP-SAT", status="blocked",
            detail=f"Minimal conflicting subset: operation(s) {core} — {conflict.explanation} "
                   f"Sources: {'; '.join(conflict.sources) if conflict.sources else 'see operations'}"))

        # --- layer 1: Muse explains; layer 2: CP-SAT verifies each option ---
        if explanation is None:
            diag, dmode = explainr.explain(scenario, message, remaining, conflict)
            explanation = diag.explanation
            explanation_mode = dmode
            dactor = f"Muse Spark · {explainr.model}" if dmode == "muse-spark" else "Template explanation (fallback)"
            trace.append(AgentStep(
                step="explain", actor=dactor,
                detail=f"Translated the solver proof into plain English with "
                       f"{len(diag.resolutions)} ranked resolution(s): {diag.explanation}"))
            for res in diag.resolutions:
                option = _verified_option(scenario, remaining,
                                          res.drop_operation_index,
                                          res.tradeoff, core)
                if option is not None:
                    options.append(option)
            # Deterministic completion: if Muse ranked fewer drops than
            # the core offers (or its ranking failed validation), verify the
            # remaining single-request drops so the user always gets every
            # one-request way out the solver can prove — never a silent pick.
            covered = {o.dropped_operation_index for o in options}
            for idx in core:
                if idx in covered or len(options) >= 3:
                    continue
                option = _verified_option(
                    scenario, remaining, idx,
                    f"Drops '{remaining[idx].explanation}' and keeps the "
                    f"other conflicting request(s).", core)
                if option is not None:
                    options.append(option)
            trace.append(AgentStep(
                step="verify", actor="CP-SAT",
                detail=f"Re-solved every proposed resolution: {len(options)} proven "
                       f"feasible — only verified options are shown, each with "
                       f"the source of the request it drops."))
            if options:
                applied_option_index = 0
                best = options[0]  # Muse's least-disruptive, now solver-verified
                victim = remaining[best.dropped_operation_index]
                dropped.append(victim)
                trace.append(AgentStep(
                    step="apply", actor="Agent (auto-apply)",
                    detail=f"Applied the least-disruptive verified resolution as the default: dropped "
                           f"'{victim.explanation}' ({best.tradeoff}) The coordinator may elect "
                           f"any other verified option instead."))
                healing_notes.append(
                    f"Self-healing: applied the least-disruptive verified resolution — "
                    f"dropped '{victim.explanation}' ({best.tradeoff})"
                )
                remaining = [o for i, o in enumerate(remaining)
                             if i != best.dropped_operation_index]
                record_event("drop", f"Self-healed: dropped '{victim.explanation}' — {best.tradeoff}",
                             {"op": victim.op, "explanation": victim.explanation})
                result = best.result
                break

        # --- fallback: drop the most recently stated conflicting request ---
        drop_idx = max(core)
        victim = remaining.pop(drop_idx)
        dropped.append(victim)
        trace.append(AgentStep(
            step="apply", actor="Agent (fallback)", status="info",
            detail=f"No verified resolution could be proven; dropped the most recently stated "
                   f"conflicting request: '{victim.explanation}' (source: {victim.source or 'the submitted request'})"))
        record_event("drop", f"Dropped '{victim.explanation}' — conflicts with the other request(s).",
                     {"op": victim.op, "explanation": victim.explanation})
        healing_notes.append(
            f"Self-healing: dropped '{victim.explanation}' — it conflicts with the other "
            f"request(s). {conflict.suggestion}"
        )

    trace.append(AgentStep(
        step="audit", actor="Audit trail",
        detail=f"Recorded the submission and {len(dropped)} dropped operation(s); "
               f"{len(remaining)} operation(s) stand applied to the term."))
    return CopilotResponse(
        summary=parsed.summary,
        operations=parsed.operations,
        applied_operations=remaining,
        dropped_operations=dropped,
        healing_notes=healing_notes,
        explanation=explanation,
        explanation_mode=explanation_mode,
        options=options,
        conflicts=first_conflict,
        applied_option_index=applied_option_index,
        result=result,
        parser_mode=parser.mode,  # type: ignore[arg-type]
        model=parser.model,
        parser_latency_ms=parser.last_latency_ms,
        agent_trace=trace,
    )
