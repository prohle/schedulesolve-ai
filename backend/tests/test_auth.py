"""Multi-user flows: demo logins, role-scoped schedules, change requests.

Coordinator publishes the solved timetable; instructors see only their own
sections and request changes; students see only their cohort's courses.
Applying a change request must run the verified co-pilot loop and
re-publish — never a raw edit.
"""


def _login(client, email, password="demo1234"):
    response = client.post("/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}


def test_demo_accounts_and_me(client, anon_client):
    headers = _login(client, "coordinator@northgate.edu")
    me = client.get("/auth/me", headers=headers).json()["user"]
    assert me["role"] == "coordinator"
    bad = client.post("/auth/login", json={
        "email": "coordinator@northgate.edu", "password": "wrong"})
    assert bad.status_code == 401
    assert anon_client.get("/schedule/mine").status_code == 401


def test_publish_then_role_scoped_mine(client):
    coordinator = _login(client, "coordinator@northgate.edu")
    published = client.post("/schedule/publish", json={"engine": "cpsat"},
                            headers=coordinator)
    assert published.status_code == 200, published.text

    chen = _login(client, "chen@northgate.edu")
    mine = client.get("/schedule/mine", headers=chen).json()
    assert mine["role"] == "instructor" and mine["placements"]
    assert all(p["instructor_id"] == "chen" for p in mine["placements"])

    student = _login(client, "cs2025@northgate.edu")
    cohort_view = client.get("/schedule/mine", headers=student).json()
    assert cohort_view["role"] == "student"
    full = client.get("/schedule/current", headers=coordinator).json()
    assert 0 < len(cohort_view["placements"]) <= len(full["timetable"]["placements"])

    # instructors cannot publish
    assert client.post("/schedule/publish", json={},
                       headers=chen).status_code == 403


def test_change_request_round_trip_through_verified_apply(client):
    coordinator = _login(client, "coordinator@northgate.edu")
    chen = _login(client, "chen@northgate.edu")
    created = client.post("/me/change-requests", headers=chen, json={
        "message": "Prof. Chen can't teach Fridays."})
    assert created.status_code == 200, created.text
    request_id = created.json()["id"]

    queue = client.get("/change-requests", headers=coordinator).json()["requests"]
    assert any(r["id"] == request_id and r["status"] == "pending" for r in queue)
    # instructors cannot decide their own request
    assert client.post(f"/change-requests/{request_id}/decide",
                       json={"action": "apply"}, headers=chen).status_code == 403

    decided = client.post(f"/change-requests/{request_id}/decide",
                          json={"action": "apply"}, headers=coordinator)
    assert decided.status_code == 200, decided.text
    body = decided.json()
    assert body["status"] == "applied"
    assert "Re-solved" in body["result_summary"]

    mine = client.get("/schedule/mine", headers=chen).json()
    assert not [p for p in mine["placements"] if 4 in p["days"]]
    own = client.get("/me/change-requests", headers=chen).json()["requests"]
    assert any(r["id"] == request_id and r["status"] == "applied" for r in own)


def test_register_new_instructor_and_login(client):
    import uuid
    email = f"newprof-{uuid.uuid4().hex[:8]}@example.edu"  # dev DB persists
    response = client.post("/auth/register", json={
        "email": email, "password": "demo1234",
        "role": "instructor", "display_name": "Prof. Diaz",
        "instructor_id": "diaz"})
    assert response.status_code == 200, response.text
    headers = _login(client, email)
    me = client.get("/auth/me", headers=headers).json()["user"]
    assert me["instructor_id"] == "diaz"
    duplicate = client.post("/auth/register", json={
        "email": email, "password": "x", "role": "student"})
    assert duplicate.status_code == 409
