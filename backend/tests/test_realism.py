"""Realism, randomized-input and independent-verification regression tests."""

from __future__ import annotations

from app.data.department import (
    build_comprehensive_scenario,
    build_department_scenario,
    build_full_university_scenario,
    build_university_scenario,
)
from app.data.random_scenario import build_random_scenario
from app.data.realism import audit_scenario
from app.intelligence.load import instructor_loads
from app.main import load_seed_scenario
from app.solver.scheduling_model import solve
from app.solver.verify import timetable_signature, verify_timetable


def test_every_built_tier_passes_the_realism_audit():
    seed = load_seed_scenario()
    for scenario in (
        seed,
        build_department_scenario(seed),
        build_university_scenario(seed),
        build_comprehensive_scenario(seed),
        build_full_university_scenario(seed),
    ):
        report = audit_scenario(scenario)
        assert report.ok, [
            (i.code, i.entity, i.message) for i in report.errors
        ]


def test_builders_do_not_share_mutable_fixtures():
    """Opening one tier must not edit another tier's degree maps."""
    seed = load_seed_scenario()
    department = build_department_scenario(seed)
    before = [list(p.roadmap) for p in department.programs]
    build_comprehensive_scenario(seed)
    after = [list(p.roadmap) for p in department.programs]
    assert before == after
    assert audit_scenario(department).ok


def test_randomized_instances_are_realistic_and_deterministic():
    for seed in range(5):
        first = build_random_scenario(seed, base="department")
        second = build_random_scenario(seed, base="department")
        assert audit_scenario(first).ok, seed
        assert first.model_dump() == second.model_dump()
        assert len(first.sections) >= 20
        assert len(first.instructors) >= 20
        assert all(
            sum(c.id in i.qualified_courses for i in first.instructors) >= 2
            for c in first.courses if first.sections_of_course(c.id)
        )


def test_solvers_return_independently_valid_timetables_and_loads():
    scenario = build_comprehensive_scenario(load_seed_scenario())
    for engine in ("cpsat", "ours", "greedy"):
        result = solve(scenario, engine=engine)
        assert result.status in ("optimal", "feasible"), (engine, result.status)
        assert result.timetable is not None
        assert verify_timetable(scenario, result) == []
        loads = instructor_loads(scenario, result.timetable)
        assert not loads.overloaded, loads.overloaded
        assert all(row.load_units <= row.load_cap + 1e-6 for row in loads.instructors)


def test_native_and_cpsat_agree_on_the_default_institution():
    scenario = build_comprehensive_scenario(load_seed_scenario())
    cpsat = solve(scenario, engine="cpsat")
    ours = solve(scenario, engine="ours")
    assert cpsat.status == ours.status == "optimal"
    assert cpsat.objective == ours.objective
    # Many tied optima; agreement is reported, not required.
    assert timetable_signature(cpsat) and timetable_signature(ours)
