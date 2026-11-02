"""Conflicts must be identifiable and electable, everywhere they surface.

For each conflict the user gets: a few solver-proven options, the source of
every piece of information that created the conflict, and a real election —
the winner they pick is the one that stands.
"""

from __future__ import annotations

import pytest

from app.ingestion.conflicts import detect_conflicts, resolve_conflicts
from app.main import load_seed_scenario
from app.models.ingestion import ExtractedRequirement, InstitutionData
from app.services.apply import apply_operations
from app.services.copilot import run_copilot
from app.services.student_plan import suggest_student_plan
from app.services.term_change import run_term_change
from app.solver.scheduling_model import solve

DIAZ = "Diaz is taking over CS 101, MATH 201 and CS 201 personally."
CHEN = "Prof. Chen will no longer teach this term — who should take over her sections?"


def test_copilot_conflict_names_sources_and_elects_a_winner():
    sc = load_seed_scenario()
    resp = run_copilot(sc, DIAZ, speaker_id="diaz")
    # The conflict is identified, with the source of each request in it.
    assert resp.conflicts is not None
    assert resp.conflicts.conflicting_operation_indices == [0, 1, 2]
    assert len(resp.conflicts.sources) == 3
    assert all("Diaz" in s and "source:" in s for s in resp.conflicts.sources)
    # A few verified options, least-disruptive auto-applied as the default.
    assert len(resp.options) >= 2
    assert resp.applied_option_index == 0
    assert all(o.result.status in ("optimal", "feasible") for o in resp.options)
    assert all(o.source and o.sources for o in resp.options)
    # Electing a different winner stands up: its operations solve cleanly.
    other = resp.options[1]
    assert other.dropped_operation_index != resp.options[0].dropped_operation_index
    world = apply_operations(sc, other.operations)
    assert solve(world).status in ("optimal", "feasible")


def test_term_change_coverage_is_electable_and_unproven_elections_refused():
    sc = load_seed_scenario()
    resp = run_term_change(sc, CHEN)
    by_section: dict[str, list[str]] = {}
    for p in resp.proposals:
        if p.feasible:
            by_section.setdefault(p.section_id, []).append(p.instructor_id)
            assert p.source and "qualified" in p.source
    electable = {sid: ids for sid, ids in by_section.items() if len(ids) >= 2}
    assert electable, "expected at least one section with two proven covers"
    sid, ids = next(iter(electable.items()))
    alternative = next(i for i in ids if i != resp.chosen[sid])
    elected = run_term_change(sc, CHEN, elected={sid: alternative})
    assert elected.chosen[sid] == alternative
    assert elected.result is not None
    assert elected.result.status in ("optimal", "feasible")
    assert not [p for p in elected.result.timetable.placements
                if p.instructor_id == "chen"]
    # The departing instructor is not a proven cover; electing them is refused.
    with pytest.raises(ValueError, match="not a solver-proven cover"):
        run_term_change(sc, CHEN, elected={sid: "chen"})


def test_term_change_api_accepts_elected_winners(client):
    r = client.post("/term-change", json={"message": CHEN})
    assert r.status_code == 200, r.text
    body = r.json()
    sid = body["affected_section_ids"][0]
    alt = next(p["instructor_id"] for p in body["proposals"]
               if p["section_id"] == sid and p["feasible"]
               and p["instructor_id"] != body["chosen"][sid])
    r = client.post("/term-change", json={"message": CHEN, "chosen": {sid: alt}})
    assert r.status_code == 200, r.text
    assert r.json()["chosen"][sid] == alt
    r = client.post("/term-change", json={"message": CHEN, "chosen": {sid: "chen"}})
    assert r.status_code == 422


def test_student_conflicts_name_both_sources():
    sc = load_seed_scenario()
    resp = suggest_student_plan(sc, "cs2025", "I need CS 301 this term.",
                                study_record="Completed: CS 101, CS 201")
    conflict = next(c for c in resp.conflicts if c.kind == "record_vs_lookup")
    assert len(conflict.sources) == 2
    assert "Your study record" in conflict.sources[0]
    assert "Cohort lookup" in conflict.sources[1]
    assert "CS 201" in conflict.sources[0]


def test_degree_map_disagreement_is_a_detected_electable_conflict():
    data = InstitutionData(
        courses=[], instructors=[], rooms=[], cohorts=[],
        degree_map=[
            ExtractedRequirement(program="BSc CS", term=3, course="CS 201",
                                 required=True, source="degree-map-2025.pdf"),
            ExtractedRequirement(program="BSc CS", term=3, course="CS 201",
                                 required=False, source="degree-map-2026.pdf"),
        ])
    conflict = next(c for c in detect_conflicts(data) if c.entity == "degree_map")
    assert "degree-map-2025.pdf" in " ".join(conflict.sources)
    assert "degree-map-2026.pdf" in " ".join(conflict.sources)
    winner = next(o.key for o in conflict.options if "2026" in o.label)
    resolved = resolve_conflicts(data, {conflict.id: winner})
    assert len(resolved.degree_map) == 1
    assert resolved.degree_map[0].required is False


def test_tightener_election_reverifies_before_applying(client):
    login = client.post("/auth/login", json={
        "email": "coordinator@schedulesolve.demo", "password": "demo1234"})
    assert login.status_code == 200, login.text
    headers = {"Authorization": f"Bearer {login.json()['token']}"}
    r = client.post("/intelligence/tighten", json={}, headers=headers)
    assert r.status_code == 200, r.text
    verified = [m for m in r.json()["moves"] if m["verified"]]
    assert verified, r.json()
    move = verified[0]
    r = client.post("/intelligence/tighten/apply",
                    json={"move": move}, headers=headers)
    assert r.status_code == 200, r.text
    # Re-verified server-side; drop_request elections are reported, not
    # silently mutated into the institution model.
    assert r.json()["kind"] == move["kind"]
    assert r.json()["applied"] is (move["kind"] != "drop_request")
