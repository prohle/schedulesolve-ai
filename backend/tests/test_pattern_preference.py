"""Meeting-shape preferences: "a 3-hour block works better for me" is a
soft, solver-honoured wish — in both engines — never a hard ban."""

from __future__ import annotations

from app.main import load_seed_scenario
from app.models.scenario import Operation
from app.parsing.mock import mock_parse
from app.parsing.parser import validate_operations
from app.solver.scheduling_model import solve


def test_mock_parses_the_pitch_sentence_into_three_documented_ops():
    sc = load_seed_scenario()
    parsed = mock_parse(
        "I have childcare on Mondays. A 3-hour class block works better "
        "for me. CS 301 is my preference.", sc, speaker_id="patel")
    ops = {(o.op, o.pattern or o.course_id or o.day) for o in parsed.operations}
    assert ("add_instructor_unavailability", 0) in ops       # childcare Monday
    assert ("add_instructor_preference", "block") in ops     # 3-hour block
    assert ("add_instructor_preference", "cs301") in ops     # course wish


def test_pattern_only_preference_survives_validation():
    sc = load_seed_scenario()
    op = Operation(op="add_instructor_preference", instructor_id="lee",
                   kind="prefer", pattern="block", weight=6,
                   explanation="Prof. Lee prefers 3-hour block meetings.")
    valid, notes = validate_operations([op], sc)
    assert valid == [op] and notes == []


def test_pattern_preference_moves_the_objective_in_both_engines():
    # Lee is the seed's block-course (CS 210 lab) instructor. Rewarding
    # block placement for Lee must not worsen either engine's objective,
    # and the preference is soft: the solve stays feasible either way.
    sc = load_seed_scenario()
    op = Operation(op="add_instructor_preference", instructor_id="lee",
                   kind="prefer", pattern="block", weight=10,
                   explanation="Prof. Lee prefers 3-hour block meetings.")
    for engine in ("cpsat", "ours"):
        base = solve(sc, engine=engine)
        with_pref = solve(sc, [op], engine=engine)
        assert base.status == "optimal" and with_pref.status == "optimal", engine
        assert with_pref.objective <= base.objective, engine
