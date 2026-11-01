"""Multi-user intake: per-professor structured constraints, staff load,
and term closures (holidays).

Each professor picks hard off-time, soft preferences, and load caps in a
grid; the coordinator approves in the same queue as free-text requests.
Structured operations are verified exactly as picked — feasible means
applied + re-published, infeasible means rejected with the solver's
explanation. Nothing is re-parsed and nothing is silently dropped.
"""

from datetime import datetime, timedelta, timezone

from app.main import load_seed_scenario
from app.models.scenario import Operation, TermClosure
from app.parsing.mock import mock_parse
from app.services.apply import apply_operations
from app.solver.scheduling_model import _options, solve


def _login(client, email, password="demo1234"):
    response = client.post("/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}


def _op(op, **kw):
    return {"op": op, "explanation": kw.pop("explanation", op), **kw}


def test_structured_intake_verified_apply_and_load(client):
    coordinator = _login(client, "coordinator@schedulesolve.demo")
    chen = _login(client, "chen@schedulesolve.demo")
    client.post("/schedule/publish", json={"engine": "cpsat"}, headers=coordinator)

    created = client.post("/me/change-requests", headers=chen, json={
        "message": "",
        "operations": [
            _op("add_instructor_unavailability", day=4,
                explanation="Prof. Chen can't teach on Fridays."),
            _op("add_instructor_preference", kind="avoid", period=0,
                explanation="Prof. Chen avoids the 8:00 period."),
            _op("set_load_cap", value=3,
                explanation="Prof. Chen can teach up to 3 sections."),
        ]})
    assert created.status_code == 200, created.text
    assert created.json()["structured"] is True
    request_id = created.json()["id"]

    queue = client.get("/change-requests", headers=coordinator).json()["requests"]
    mine_req = next(r for r in queue if r["id"] == request_id)
    assert mine_req["kind"] == "structured"
    assert len(mine_req["operations"]) == 3
    assert mine_req["load"]["max_sections"] is not None

    decided = client.post(f"/change-requests/{request_id}/decide",
                          json={"action": "apply"}, headers=coordinator)
    assert decided.status_code == 200, decided.text
    assert decided.json()["status"] == "applied"
    assert "verified by the solver" in decided.json()["result_summary"]

    mine = client.get("/schedule/mine", headers=chen).json()
    assert mine["load"]["current"] == len(mine["placements"])
    assert mine["load"]["max_sections"] == 3  # the picked cap was committed
    assert not [p for p in mine["placements"] if 4 in p["days"]]


def test_structured_intake_infeasible_is_rejected_with_reason(client):
    coordinator = _login(client, "coordinator@schedulesolve.demo")
    # Every professor declares a zero teaching load (sabbatical). One or two
    # are absorbable by colleagues; at some point the remaining contract
    # capacity is below the 8 sections and the solver must reject the request
    # rather than silently overloading anyone.
    instructor_ids = [i.id for i in load_seed_scenario().instructors]
    request_ids = []
    for instructor_id in instructor_ids:
        token = _login(client, f"{instructor_id}@schedulesolve.demo")
        created = client.post("/me/change-requests", headers=token, json={
            "operations": [
                _op("set_load_cap", value=0,
                    explanation=f"Prof. {instructor_id} is on sabbatical this term."),
            ]})
        assert created.status_code == 200, created.text
        request_ids.append(created.json()["id"])

    decisions = []
    for request_id in request_ids:
        decided = client.post(
            f"/change-requests/{request_id}/decide",
            json={"action": "apply"}, headers=coordinator)
        assert decided.status_code == 200, decided.text
        decisions.append(decided.json())
    assert any(d["status"] == "applied" for d in decisions)
    assert decisions[-1]["status"] == "rejected"
    assert decisions[-1]["result_summary"]


def test_structured_intake_whitelist_and_self_only(client):
    chen = _login(client, "chen@schedulesolve.demo")
    # Campus closures are the coordinator's, not a professor's pick.
    only_forbidden = client.post("/me/change-requests", headers=chen, json={
        "operations": [_op("add_term_closure", day=4, label="Holiday",
                           explanation="No classes on Fridays.")]})
    assert only_forbidden.status_code == 422

    # Ops aimed at a colleague are re-pointed at the submitter, never Diaz.
    created = client.post("/me/change-requests", headers=chen, json={
        "operations": [_op("add_instructor_unavailability", day=1,
                           instructor_id="diaz",
                           explanation="Prof. Chen can't teach on Tuesdays.")]})
    assert created.status_code == 200, created.text
    own = client.get("/me/change-requests", headers=chen).json()["requests"]
    req = next(r for r in own if r["id"] == created.json()["id"])
    assert req["operations"][0]["instructor_id"] == "chen"


def test_faculty_individual_can_elect_constraints_before_deadline(client):
    """Every professor logs in, sees only their own submission, and elects
    hard + soft constraints until the deadline — then the window refuses."""
    coordinator = _login(client, "coordinator@schedulesolve.demo")
    chen = _login(client, "chen@schedulesolve.demo")
    diaz = _login(client, "diaz@schedulesolve.demo")
    future = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
    client.post("/term/window", headers=coordinator,
                json={"deadline": future, "status": "open"})

    submitted = client.post("/term/window/submit", headers=chen, json={
        "hard_unavailable": [{"day": 4, "period": 2}],
        "preferences": [
            {"kind": "prefer", "day": 1, "period": 1, "weight": 8},
            {"kind": "avoid", "period": 0, "weight": 5},
        ],
        "note": "Committee duty Friday afternoon.",
    })
    assert submitted.status_code == 200, submitted.text
    submission = submitted.json()["submission"]
    assert submission["instructor_id"] == "chen"
    assert submission["hard_count"] == 1
    assert submission["preference_count"] == 2

    # Per-individual: Chen sees her own submission; Diaz does not see it.
    chen_window = client.get("/term/window", headers=chen).json()
    assert [s["instructor_id"] for s in chen_window["submissions"]] == ["chen"]
    diaz_window = client.get("/term/window", headers=diaz).json()
    assert all(s["instructor_id"] == "diaz" for s in diaz_window["submissions"])
    assert chen_window["open"] is True

    # The deadline closes the election: the same login is refused.
    client.post("/term/window/close", headers=coordinator)
    denied = client.post("/term/window/submit", headers=chen, json={
        "hard_unavailable": [], "preferences": [], "note": "late"})
    assert denied.status_code == 409


def test_dated_holiday_and_day_swap_are_real_calendar_days(client):
    """A holiday removes one real date; a swap makes another date follow a
    different weekday (e.g. Friday classes meet on a Tuesday schedule)."""
    coordinator = _login(client, "coordinator@schedulesolve.demo")
    saved = client.post("/term/calendar", headers=coordinator, json={
        "start_date": "2026-08-24",
        "weeks": 16,
        "holidays": [{"date": "2026-11-26", "label": "Thanksgiving"}],
        "swaps": [{"date": "2026-11-27", "follows": 1,
                   "label": "Friday follows Tuesday"}],
    })
    assert saved.status_code == 200, saved.text
    calendar = client.get("/term/calendar", headers=coordinator).json()

    holiday = next(d for d in calendar["days"] if d["date"] == "2026-11-26")
    assert holiday["status"] == "holiday"
    assert holiday["effective_weekday"] is None

    swap = next(d for d in calendar["days"] if d["date"] == "2026-11-27")
    assert swap["status"] == "swap"
    assert swap["effective_weekday"] == 1  # Tuesday
    assert swap["label"] == "Friday follows Tuesday"
    assert calendar["totals"]["holidays"] == 1
    assert calendar["totals"]["swaps"] == 1


def test_term_closure_blocks_slots_in_solver(client):
    sc = load_seed_scenario()
    sc.closures = [TermClosure(day=4, label="Reading day")]  # Fridays closed
    mwf = next(s for s in sc.sections
               if sc.course(s.course_id).pattern == "MWF")
    tth = next(s for s in sc.sections
               if sc.course(s.course_id).pattern == "TTh")
    assert _options(sc, mwf) == []       # every MWF option meets Friday
    assert _options(sc, tth) != []       # TTh never touches Friday

    sc.closures = [TermClosure(day=3, period=2, label="Convocation")]
    result = solve(sc)
    assert result.status != "infeasible"
    for p in result.timetable.placements:
        assert not (3 in p.days and p.period == 2)


def test_term_closure_endpoint_coordinator_only(client):
    coordinator = _login(client, "coordinator@schedulesolve.demo")
    chen = _login(client, "chen@schedulesolve.demo")
    body = {"closures": [{"day": 3, "period": 2, "label": "Convocation"}]}
    assert client.post("/term/closures", json=body, headers=chen).status_code == 403
    set_resp = client.post("/term/closures", json=body, headers=coordinator)
    assert set_resp.status_code == 200, set_resp.text
    scenario = client.get("/scenario").json()
    assert scenario["closures"] == [
        {"day": 3, "period": 2, "label": "Convocation"}]
    published = client.post("/schedule/publish", json={"engine": "cpsat"},
                            headers=coordinator)
    assert published.status_code == 200, published.text
    full = client.get("/schedule/current", headers=coordinator).json()
    for p in full["timetable"]["placements"]:
        assert not (3 in p["days"] and p["period"] == 2)


def test_closure_op_round_trip_and_mock_parse(client):
    sc = load_seed_scenario()
    parsed = mock_parse("No classes on Friday — it's a holiday.", sc)
    assert [o.op for o in parsed.operations] == ["add_term_closure"]
    updated = apply_operations(sc, parsed.operations)
    assert updated.closures[0].day == 4

    # Same closure as a request op, honored identically by every engine.
    op = Operation(op="add_term_closure", day=3, period=2,
                   label="Convocation", explanation="No classes Thu period 2.")
    for engine in ("cpsat", "ours", "greedy"):
        result = solve(sc, [op], engine=engine)
        assert result.status != "infeasible", engine
        for p in result.timetable.placements:
            assert not (3 in p.days and p.period == 2), engine
