"""Plug-and-play solver engines behind one standardized interface.

Every engine implements the same contract:

    solve(scenario, request_ops, pins_exact, instructor_pins,
          slot_hints, objective) -> SolveResult

Registering a new engine is one entry in `ENGINES` plus a solve function —
the API (`POST /solve` with `engine`, `GET /engines`), the benchmark, and
the Build-step engine picker all discover it from here. That standardized
interface is what makes the head-to-head comparison a level playing field:
identical scenario, identical ops, identical objective, identical output
shape — only the search differs.

  cpsat   OR-Tools CP-SAT (Google): industrial C++ constraint solver,
          clause learning, proves optimality in fractions of a second.
  ours    ScheduleSolve home solver: AI-crafted pure-Python search
          (MRV + forward checking + branch-and-bound + ejection
          hill-climbing), designed around this problem's trade-offs.
  greedy  The home solver's first descent only — a milliseconds-fast
          "good enough" layout that shows what the optimization phases buy.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Optional

from app.models.results import SolveResult
from app.models.scenario import Operation, Scenario


@dataclass(frozen=True)
class EngineInfo:
    id: str
    label: str
    kind: str
    description: str


ENGINES: list[EngineInfo] = [
    EngineInfo(
        id="cpsat", label="OR-Tools CP-SAT", kind="industrial",
        description="Google's C++ constraint solver — clause learning, "
                    "assumption-literal conflict cores, proven optima in milliseconds."),
    EngineInfo(
        id="ours", label="ScheduleSolve solver (ours)", kind="ai-crafted",
        description="AI-authored solver built for this problem: native C++ search "
                    "core (MRV + forward checking, branch-and-bound with an admissible "
                    "bound, ejection hill-climbing, deletion-minimized conflict cores) "
                    "over the identical domains CP-SAT uses; Python reference search "
                    "when the native binary is not built."),
    EngineInfo(
        id="greedy", label="Greedy descent (ours, fast)", kind="ai-crafted",
        description="The home solver's first greedy descent only — no optimization "
                    "phases. Milliseconds-fast, visibly worse preferences."),
]

ENGINE_IDS = [e.id for e in ENGINES]


def list_engines() -> list[dict]:
    return [asdict(e) for e in ENGINES]


_STATUS_RANK = {"optimal": 0, "feasible": 1, "infeasible": 2}


def rank_results(named: list[tuple[str, SolveResult]]) -> tuple[str, str]:
    """Rank engines by what they actually spit out, best first.

    Order of evidence: (1) proven status — optimal beats feasible beats
    infeasible; (2) preference penalty (lower wins); (3) runtime (faster
    wins). Returns (winner_id_or_"tie", plain-English verdict). Ranking is
    computed from outputs only — no engine gets a head start.
    """
    def key(item: tuple[str, SolveResult]):
        _, r = item
        obj = r.objective if r.objective is not None else float("inf")
        return (_STATUS_RANK.get(r.status, 3), obj, r.solve_time_ms)

    ordered = sorted(named, key=key)
    (win_id, win), (los_id, los) = ordered[0], ordered[1]
    if key(ordered[0]) == key(ordered[1]):
        return "tie", (f"Dead heat: both engines returned {win.status} at penalty "
                       f"{win.objective} in {win.solve_time_ms} ms.")
    reasons = []
    if _STATUS_RANK.get(win.status, 3) != _STATUS_RANK.get(los.status, 3):
        reasons.append(f"{win.status} beats {los.status}")
    elif win.objective != los.objective:
        reasons.append(f"lower preference penalty ({win.objective} vs {los.objective})")
    if not reasons:
        reasons.append(f"same {win.status} at penalty {win.objective}, "
                       f"but faster ({win.solve_time_ms} ms vs {los.solve_time_ms} ms)")
    elif win.solve_time_ms != los.solve_time_ms:
        reasons.append(f"{win.solve_time_ms} ms vs {los.solve_time_ms} ms")
    labels = {e.id: e.label for e in ENGINES}
    return win_id, f"{labels.get(win_id, win_id)} ranks first: " + "; ".join(reasons) + "."


def solve_with(engine: str, sc: Scenario,
               request_ops: Optional[list[Operation]] = None,
               pins_exact: Optional[dict] = None,
               instructor_pins: Optional[dict[str, str]] = None,
               slot_hints: Optional[dict[str, int]] = None,
               objective: str = "preference") -> SolveResult:
    """Dispatch to a registered engine. Raises KeyError for unknown ids."""
    if engine == "cpsat":
        from app.solver.scheduling_model import solve as cpsat_solve
        return cpsat_solve(sc, request_ops, pins_exact=pins_exact,
                           instructor_pins=instructor_pins, slot_hints=slot_hints,
                           objective=objective, engine="cpsat")
    if engine in ("ours", "greedy"):
        from app.solver.home_solver import solve_home
        from app.solver.native_solver import native_available, solve_native
        if native_available():
            # `greedy` is the same native core stopped after its first
            # descent: a millisecond-fast baseline at every scale, not just
            # the sizes the pure-Python reference can finish.
            return solve_native(sc, request_ops, pins_exact=pins_exact,
                                instructor_pins=instructor_pins, slot_hints=slot_hints,
                                objective=objective, quick=(engine == "greedy"))
        return solve_home(sc, request_ops, pins_exact=pins_exact,
                          instructor_pins=instructor_pins, slot_hints=slot_hints,
                          objective=objective, quick=(engine == "greedy"))
    raise KeyError(f"unknown solver engine: {engine!r} (available: {ENGINE_IDS})")
