"""Self-healing explanation layer: Muse Spark explains what the solver proved.

Division of labor, made explicit:
- CP-SAT PROVES infeasibility and names the minimal conflicting subset
  (assumption literals).
- Muse Spark TRANSLATES: plain-English explanation + ranked resolutions.
- CP-SAT VERIFIES every resolution by re-solving before it can be shown.

The LLM never invents a fix; it proposes candidates and the solver disposes.
Every resolution index is validated against the conflict core, and every
surviving option carries its own verified SolveResult.
"""

from __future__ import annotations

import logging
from typing import Optional

from app import config
from app.models.results import ConflictReport, ExplanationResult, Resolution
from app.models.scenario import Operation, Scenario

logger = logging.getLogger(__name__)


class ConflictExplainer:
    """Mirrors ConstraintParser: Muse Spark when a key exists, template mock otherwise."""

    def __init__(self) -> None:
        self.mode: str = "mock" if not config.MUSE_API_KEY else "muse-spark"
        self.model: str | None = config.MUSE_MODEL if config.MUSE_API_KEY else None
        self._client = None
        if config.MUSE_API_KEY:
            from openai import OpenAI
            self._client = OpenAI(
                base_url=config.MUSE_BASE_URL, api_key=config.MUSE_API_KEY,
                timeout=config.MUSE_TIMEOUT_S)

    def explain(
        self,
        scenario: Scenario,
        message: str,
        ops: list[Operation],
        conflicts: ConflictReport,
    ) -> tuple[ExplanationResult, str]:
        """Returns (validated explanation, mode). Resolutions are constrained
        to the conflict core and capped at 3."""
        core = conflicts.conflicting_operation_indices
        if self._client is None:
            return _mock_explanation(ops, core), self.mode
        try:
            response = self._client.beta.chat.completions.parse(
                model=config.MUSE_MODEL,
                messages=[
                    {"role": "system", "content": _EXPLANATION_SYSTEM_PROMPT},
                    {"role": "user", "content": _build_case_prompt(scenario, message, ops, core)},
                ],
                response_format=ExplanationResult,
                reasoning_effort=config.MUSE_REASONING_EFFORT,
            )
            parsed: Optional[ExplanationResult] = response.choices[0].message.parsed
            if parsed is None:
                raise ValueError("model returned no parsed explanation")
            return _validate(parsed, core), self.mode
        except Exception:
            logger.exception("Muse Spark explanation failed; falling back to template")
            return _mock_explanation(ops, core), "mock"


def _validate(parsed: ExplanationResult, core: list[int]) -> ExplanationResult:
    seen: set[int] = set()
    resolutions: list[Resolution] = []
    for r in parsed.resolutions:
        if r.drop_operation_index in core and r.drop_operation_index not in seen:
            seen.add(r.drop_operation_index)
            resolutions.append(Resolution(drop_operation_index=r.drop_operation_index, tradeoff=r.tradeoff))
    return ExplanationResult(explanation=parsed.explanation, resolutions=resolutions[:3])


def _mock_explanation(ops: list[Operation], core: list[int]) -> ExplanationResult:
    named = " / ".join(f"'{ops[i].explanation}'" for i in core)
    resolutions = [
        Resolution(drop_operation_index=i, tradeoff=f"Weakest link: drops '{ops[i].explanation}' and keeps the rest.")
        for i in core[:3]
    ]
    return ExplanationResult(
        explanation=f"(template) These requests cannot all hold: {named}. Dropping any one of them lets the timetable re-solve.",
        resolutions=resolutions,
    )


_EXPLANATION_SYSTEM_PROMPT = """You are the self-healing explanation module of ScheduleSolve AI, a
department course-timetabling co-pilot. You receive a scheduling request
that CP-SAT just PROVED infeasible, together with the solver's minimal
conflict core. Your job is translation, not invention: explain the conflict
to a human scheduler and rank ways out — every resolution you propose will be
re-solved by CP-SAT before it is shown, so only propose real options.

Respond with:
1. explanation: 2-4 sentences of plain English for a department scheduler —
   name the requests that clash and the binding rules (e.g., a load cap, a
   room capacity, a cohort conflict).
2. resolutions: up to 3, ranked least-disruptive first. Each must drop
   exactly ONE request, identified by its index from the conflict core, with
   one sentence on the trade-off of dropping it."""


def _build_case_prompt(scenario: Scenario, message: str, ops: list[Operation], core: list[int]) -> str:
    ops_listing = "\n".join(
        f"[{i}] {op.op} — {op.explanation}"
        + (f" (source: {op.source})" if op.source else "")
        for i, op in enumerate(ops))
    core_listing = ", ".join(f"[{i}] {ops[i].explanation}" for i in core)
    instructors = "; ".join(
        f"{i.name} (max {i.max_sections} sections, qualified: {', '.join(i.qualified_courses)})"
        for i in scenario.instructors
    )
    return f"""The scheduler said: "{message}"

The parsed requests:
{ops_listing}

The solver's minimal conflict core: {core_listing}

World context: instructors — {instructors}. Base rules include instructor
load caps, one-section-per-room-per-slot, room capacity/type/equipment,
fixed meeting patterns, cohort conflict-freedom, and walk distances between
buildings.

Explain this infeasibility and propose resolutions. Valid drop indices for
resolutions: {", ".join(str(i) for i in core)}."""
