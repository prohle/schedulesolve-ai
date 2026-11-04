"""Native C++ solver vs CP-SAT: proven parity at every scale.

The native core must (a) prove the same optimum CP-SAT proves — status
`optimal`, identical objective — at seed, department, and university
scale, (b) satisfy every hard constraint checked from placements alone,
(c) return the same minimal conflict core on the Diaz overload, and
(d) be deterministic. Skipped when the binary is not built
(`backend/scripts/build_native.sh`); CI builds it before running tests.
"""

import pytest

from app.data.department import build_department_scenario, build_university_scenario
from app.main import load_seed_scenario
from app.models.scenario import Operation
from app.solver.native_solver import native_available, solve_native
from app.solver.scheduling_model import solve as cpsat_solve
from tests.test_home_solver import assert_hard_constraints_hold

pytestmark = pytest.mark.skipif(not native_available(),
                                reason="native solver binary not built")


def _key(result):
    return sorted((p.section_id, p.instructor_id, tuple(p.days), p.period, p.room_id)
                  for p in result.timetable.placements)


@pytest.mark.parametrize("builder", [None, build_department_scenario,
                                     build_university_scenario])
def test_native_proves_cpsat_optimum_at_every_scale(builder):
    sc = load_seed_scenario()
    if builder:
        sc = builder(sc)
    native = solve_native(sc)
    cpsat = cpsat_solve(sc)
    assert cpsat.status == "optimal"
    assert native.status == "optimal"          # proven, not just feasible
    assert native.objective == cpsat.objective
    assert_hard_constraints_hold(sc, native)


def test_native_same_conflict_core_as_cpsat():
    sc = load_seed_scenario()
    ops = [
        Operation(op="set_section_instructor", section_id="sec-cs101",
                  instructor_id="diaz", explanation="Diaz takes CS 101."),
        Operation(op="set_section_instructor", section_id="sec-math201",
                  instructor_id="diaz", explanation="Diaz takes MATH 201."),
        Operation(op="set_section_instructor", section_id="sec-cs201",
                  instructor_id="diaz", explanation="Diaz takes CS 201."),
    ]
    native = solve_native(sc, ops)
    cpsat = cpsat_solve(sc, ops)
    assert native.status == cpsat.status == "infeasible"
    assert native.conflicts.conflicting_operation_indices == \
        cpsat.conflicts.conflicting_operation_indices == [0, 1, 2]


def test_native_is_deterministic():
    sc = build_department_scenario(load_seed_scenario())
    a = solve_native(sc)
    b = solve_native(sc)
    assert a.status == b.status == "optimal"
    assert _key(a) == _key(b)


def test_native_returns_optimal_on_empty_timetable():
    """A 0-section institution is trivially feasible and optimal; the native
    core must agree with CP-SAT instead of misreporting it as infeasible
    (regression: the wrapper treated the empty `assignment` list as falsy)."""
    sc = load_seed_scenario().model_copy(update={"sections": []})
    native = solve_native(sc)
    cpsat = cpsat_solve(sc)
    assert cpsat.status == "optimal"
    assert native.status == "optimal"
    assert native.objective == cpsat.objective


def test_native_honors_request_ops():
    sc = load_seed_scenario()
    ops = [Operation(op="add_instructor_unavailability", instructor_id="patel",
                     day=0, explanation="Patel unavailable Mondays.")]
    result = solve_native(sc, ops)
    assert result.status == "optimal"
    assert not [p for p in result.timetable.placements
                if p.instructor_id == "patel" and 0 in p.days]
    assert_hard_constraints_hold(sc, result)
