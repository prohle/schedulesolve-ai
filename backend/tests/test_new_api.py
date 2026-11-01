"""HTTP surface for the coordinator-owned policy, catalog and calendar."""

from __future__ import annotations


def _login(client, email="coordinator@schedulesolve.demo"):
    response = client.post("/auth/login", json={"email": email, "password": "demo1234"})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}


def test_policy_and_time_grid_are_editable(client):
    headers = _login(client)
    policy = client.get("/institution/policy", headers=headers).json()
    assert policy["min_courses_full_time"] == 4

    updated = client.post("/institution/policy", headers=headers, json={
        "policy": {"min_courses_full_time": 5, "min_credits_full_time": 15},
    })
    assert updated.status_code == 200, updated.text
    assert updated.json()["policy"]["min_courses_full_time"] == 5
    assert updated.json()["suggestion"]["load_exponent"] > 0

    grid = client.get("/institution/time-grid", headers=headers).json()
    assert grid["periods"]
    assert {p["name"] for p in grid["patterns"]} == {"MWF", "TTh", "block"}

    new_grid = {
        "day_start": "08:30", "day_end": "21:00",
        "periods": [
            {"start": "08:30", "end": "10:00", "minutes": 90},
            {"start": "10:00", "end": "11:30", "minutes": 90},
        ],
        "patterns": [
            {"name": "MWF", "days": [0, 2, 4], "duration_hours": 1.5},
            {"name": "TTh", "days": [1, 3], "duration_hours": 1.5},
            {"name": "block", "kind": "block", "days": [1, 2, 3],
             "periods": [1], "duration_hours": 3.0},
        ],
        "allowed_durations_min": [50, 80, 170],
    }
    saved = client.post("/institution/time-grid", headers=headers,
                        json={"time_grid": new_grid})
    assert saved.status_code == 200, saved.text
    assert saved.json()["time_grid"]["day_start"] == "08:30"


def test_catalog_offering_and_special_topic_endpoints(client):
    headers = _login(client)
    before = client.get("/institution/catalog/offerings", headers=headers).json()
    assert before["counts"]["offered"] >= 8

    paused = client.post("/institution/catalog/offering", headers=headers, json={
        "course_id": "cs350", "status": "not_offered",
        "reason": "No qualified instructor this term",
    })
    assert paused.status_code == 200, paused.text
    assert paused.json()["summary"]["counts"]["not_offered"] == 1

    restored = client.post("/institution/catalog/offering", headers=headers, json={
        "course_id": "cs350", "status": "offered", "reason": "Restored",
    })
    assert restored.status_code == 200, restored.text
    assert restored.json()["summary"]["counts"]["not_offered"] == 0

    topic = client.post("/institution/catalog/special-topic", headers=headers, json={
        "code": "CS 490", "title": "Special Topics: Verification",
        "department": "CS", "instructor_id": "chen", "credits": 2,
        "pattern": "TTh", "room_type": "seminar", "seats": 15,
        "reason": "One-off seminar",
    })
    assert topic.status_code == 200, topic.text
    course_id = topic.json()["course"]["id"]
    assert topic.json()["summary"]["counts"]["special_topic"] == 1

    removed = client.delete(f"/institution/catalog/special-topic/{course_id}",
                            headers=headers)
    assert removed.status_code == 200, removed.text
    assert removed.json()["summary"]["counts"]["special_topic"] == 0


def test_load_population_and_calendar_endpoints(client):
    headers = _login(client)
    load = client.get("/institution/load", headers=headers).json()
    assert load["totals"]["sections"] == 8
    assert load["overloaded"] == []

    population = client.get("/institution/population", headers=headers).json()
    assert population["cohorts_by_level"]["bachelor"] == 4
    assert population["full_time_policy"]["min_courses"] == 4

    suggestion = client.get("/institution/load/suggest?target_ratio_80_40=1.5",
                            headers=headers).json()
    assert suggestion["load_exponent"] > 0

    holidays = client.get("/term/calendar/national-holidays?year=2026&country=US",
                          headers=headers).json()
    assert any(h["label"] == "Thanksgiving" for h in holidays["holidays"])

    fall = client.get("/term/calendar/suggest?year=2026&term=fall&weeks=15",
                      headers=headers).json()
    assert fall["start_date"] < fall["end_date"]
    assert fall["suggested_swaps"]

    applied = client.post("/term/calendar/apply-suggested", headers=headers, json={
        "year": 2026, "term": "fall", "weeks": 15, "country": "US",
    })
    assert applied.status_code == 200, applied.text
    calendar = applied.json()["calendar"]
    assert calendar["holidays"]
    assert calendar["swaps"]
