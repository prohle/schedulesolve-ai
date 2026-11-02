"""API contract tests: the commit step must survive a subsequent solve."""

from __future__ import annotations


def test_status(client):
    assert client.get("/status").json()["status"] == "ok"


def test_apply_then_solve_keeps_patel_off_monday(client):
    copilot = client.post("/copilot", json={
        "message": "Prof. Patel can't teach Mondays — committee duty. "
                   "She'd rather not teach at 8:00."}).json()
    assert copilot["applied_operations"]

    applied = client.post("/apply", json={"operations": copilot["applied_operations"]})
    assert applied.status_code == 200
    assert applied.json()["instructors"][1]["hard_unavailable"]

    solved = client.post("/solve", json={"scenario": client.get("/scenario").json(),
                                         "operations": []}).json()
    patel = [p for p in solved["timetable"]["placements"]
             if p["instructor_id"] == "patel" and 0 in p["days"]]
    assert not patel


def test_term_change_apply_removes_instructor_for_good(client):
    term_change = client.post("/term-change", json={
        "message": "Prof. Chen will no longer teach this term — who should take over her sections?"}).json()
    assert term_change["chosen"]

    applied = client.post("/apply", json={
        "pins": term_change["chosen"],
        "remove_instructor_id": term_change["removed_instructor_id"],
    }).json()
    assert not [i for i in applied["instructors"] if i["id"] == "chen"]

    solved = client.post("/solve", json={"scenario": applied,
                                         "operations": []}).json()
    assert not [p for p in solved["timetable"]["placements"]
                if p["instructor_id"] == "chen"]


def test_speaker_context_attributes_identity_dependent_requests(client):
    response = client.post("/copilot", json={
        "message": "I can't teach Mondays. Keep me under 3 preps.",
        "speaker_id": "patel",
    }).json()
    ops = [o["op"] for o in response["applied_operations"]]
    assert "add_instructor_unavailability" in ops
    assert "set_prep_cap" in ops


def test_voice_endpoint_requires_a_meta_key(client):
    response = client.post(
        "/term-change/audio",
        files={"file": ("note.wav", b"RIFF0000WAVE", "audio/wav")},
    )
    assert response.status_code == 503


def test_voice_transcript_cleanup_keeps_the_request_readable():
    from app.services.voice import clean_transcript

    raw = "  I work Tuesdays Tuesdays and Thursdays..  Help me choose choose my classes.. "
    assert clean_transcript(raw) == (
        "I work Tuesdays and Thursdays. Help me choose my classes.")


def test_reset_returns_to_the_seed(client):
    client.post("/apply", json={"operations": [{
        "op": "remove_instructor", "instructor_id": "chen", "explanation": "out"}]})
    assert not [i for i in client.get("/scenario").json()["instructors"] if i["id"] == "chen"]
    client.post("/scenario/reset")
    assert [i for i in client.get("/scenario").json()["instructors"] if i["id"] == "chen"]
