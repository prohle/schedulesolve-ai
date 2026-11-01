"""ScheduleSolve AI — backend entry point.

    instructor/chair message -> Muse Spark constraint parsing -> CP-SAT
    solve -> timetable, minimal-conflict explanation, or verified term-change
    reassignment proposals.

Built during the Meta Global AI Developer Hackathon (Oct 27 - Nov 4, 2026).
"""

from __future__ import annotations

import json
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from pydantic import BaseModel

from app import config
from app.db import init_db
from app.ingestion import check_completeness, ingest
from app.ingestion.normalize import build_scenario
from app.ingestion.parser import IngestionParser
from app.intelligence import analyze, build_matrices, compute_utilization, run_tightener, whatif
from app.intelligence.matrices import compute_margins
from app.models.ingestion import CompletenessReport, InstitutionData
from app.models.intelligence import (
    MarginsReport,
    MatricesReport,
    SpectralReport,
    TightenResponse,
    UtilizationReport,
    WhatIfReport,
)
from app.models.results import (
    AgentStep,
    CompareResult,
    CopilotResponse,
    StudentPlanResponse,
    TermChangeResponse,
    SolveResult,
)
from app.models.scenario import Operation, ParsedRequest, Scenario, TermClosure
from app.parsing.parser import ConstraintParser, validate_operations
from app.services import audit
from app.services import term as term_service
from app.services.apply import apply_operations
from app.services.copilot import run_copilot
from app.services.student_plan import suggest_student_plan
from app.services.term_change import run_term_change
from app.services.voice import transcribe_wav
from app.solver.scheduling_model import solve


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()  # create provenance tables if they don't exist (best-effort)
    try:
        from app.services.auth import seed_demo_users
        seed_demo_users(get_current_scenario())
    except Exception:  # noqa: BLE001 — auth seeding must never block solving
        pass
    yield


app = FastAPI(title="ScheduleSolve AI", version="0.2.0", lifespan=lifespan)


def load_seed_scenario() -> Scenario:
    with open(config.SEED_SCENARIO_PATH) as f:
        return Scenario.model_validate(json.load(f))


# The "current" scenario: seeded from the file, replaceable by /ingest (the
# "point the tool at your data" step). In-memory for the demo; the audit trail
# is the durable record of what happened.
_current_scenario: Optional[Scenario] = None


def get_current_scenario() -> Scenario:
    """The durable institution model: load it from Postgres, or seed the
    comprehensive university on first run and persist it."""
    global _current_scenario
    if _current_scenario is not None:
        return _current_scenario
    try:
        from app.services.state import load_state
        stored = load_state()
        if stored is not None:
            _current_scenario = stored
            return _current_scenario
    except Exception:  # noqa: BLE001 — a missing row is the normal first run
        pass
    from app.data.department import build_comprehensive_scenario
    _current_scenario = build_comprehensive_scenario(load_seed_scenario())
    try:
        from app.services.state import save_state
        save_state(_current_scenario)
    except Exception:  # noqa: BLE001
        pass
    return _current_scenario


def _clear_published() -> None:
    """A changed institution model invalidates the published timetable."""
    try:
        from app.db import SessionLocal
        from app.models.auth import PublishedSchedule
        with SessionLocal() as session:
            session.query(PublishedSchedule).delete()
            session.commit()
    except Exception:  # noqa: BLE001
        pass


def _set_current_scenario(scenario: Scenario) -> None:
    """Swap the institution model, persist it, and invalidate the old term."""
    global _current_scenario
    _current_scenario = scenario
    try:
        from app.services.state import save_state
        save_state(scenario)
    except Exception:  # noqa: BLE001 — solver keeps working if persistence hiccups
        pass
    _clear_published()


class MessageRequest(BaseModel):
    message: str
    scenario: Optional[Scenario] = None
    speaker_id: Optional[str] = None  # intake window: who is speaking


class StudentPlanRequest(BaseModel):
    cohort_id: Optional[str] = None       # progress lookup when no record given
    program_id: Optional[str] = None      # desired degree (default: cohort's)
    study_record: Optional[str] = None    # pasted record: course codes/names
    completed_course_ids: list[str] = []
    message: str
    target_courses: Optional[int] = None
    scenario: Optional[Scenario] = None


class ApplyOpsRequest(BaseModel):
    """Commit a verified proposal to the durable term state."""

    operations: list[Operation] = []
    pins: dict[str, str] = {}          # section_id -> instructor_id
    remove_instructor_id: Optional[str] = None
    scenario: Optional[Scenario] = None


class SolveRequest(BaseModel):
    scenario: Scenario
    operations: Optional[list] = None
    engine: str = "cpsat"  # "cpsat" (OR-Tools) | "ours" (ScheduleSolve home solver)


class IngestRequest(BaseModel):
    text: str


class ApplyRequest(BaseModel):
    data: InstitutionData


class IngestResponse(BaseModel):
    scenario: Scenario
    parsed: InstitutionData
    parser_mode: str
    completeness: CompletenessReport
    model: Optional[str] = None
    parser_latency_ms: Optional[int] = None


def _ingest_text(text: str) -> IngestResponse:
    """Shared ingest core: parse, assemble, store the current scenario, audit."""
    global _current_scenario
    parser = IngestionParser()
    data = parser.parse(text)
    scenario = ingest(text)[0]
    _set_current_scenario(scenario)
    audit.record_submission(text[:500], data.summary, parser.mode)
    audit.record_event("ingest",
                       f"Ingested {len(data.courses)} courses, {len(data.instructors)} instructors, "
                       f"{len(data.cohorts)} cohorts, {len(data.rooms)} rooms",
                       {"courses": len(data.courses), "instructors": len(data.instructors),
                        "cohorts": len(data.cohorts), "rooms": len(data.rooms)})
    return IngestResponse(scenario=scenario, parsed=data, parser_mode=parser.mode,
                          completeness=check_completeness(data),
                          model=parser.model, parser_latency_ms=parser.last_latency_ms)


@app.get("/status")
def status() -> dict:
    return {"status": "ok", "service": "schedulesolve-ai-backend"}


@app.get("/history")
def history() -> dict:
    """The audit trail: every intake submission + change event, most recent first."""
    return audit.history()


@app.get("/scenario", response_model=Scenario)
def get_scenario() -> Scenario:
    return get_current_scenario()


@app.post("/ingest", response_model=IngestResponse)
def ingest_data(req: IngestRequest) -> IngestResponse:
    """Point the tool at free-form institutional data (catalog, degree maps,
    cohorts, faculty, campus, facilities). Muse Spark autocleans it into the
    structured scenario, which becomes current for every later call."""
    return _ingest_text(req.text)


@app.post("/ingest/files", response_model=IngestResponse)
async def ingest_files(files: list[UploadFile] = File(...)) -> IngestResponse:
    """Drop messy institutional files in any format — PDF, Word, Excel, CSV,
    JSON, text, or a zip of all of them. Each file is extracted to text
    (app.ingestion.extract), concatenated, and autocleaned; the response
    reports which of the six required inputs were found and which are missing."""
    from app.ingestion.extract import extract_text
    chunks: list[str] = []
    for f in files:
        content = await f.read()
        name = f.filename or "file"
        chunks.append(f"\n--- {name} ---\n" + extract_text(name, content))
    return _ingest_text("".join(chunks))


@app.post("/ingest/apply", response_model=IngestResponse)
def ingest_apply(req: ApplyRequest) -> IngestResponse:
    """Finalize an edited extraction: rebuild the scenario from the reviewed
    (keep/changed) entities and make it current. The frontend sends back the
    user-edited InstitutionData after the review panel."""
    global _current_scenario
    scenario = build_scenario(req.data)
    _set_current_scenario(scenario)
    audit.record_event("ingest-apply",
                       f"Applied edited data: {len(req.data.courses)} courses, "
                       f"{len(req.data.instructors)} instructors, {len(req.data.cohorts)} cohorts")
    return IngestResponse(scenario=scenario, parsed=req.data, parser_mode="reviewed",
                          completeness=check_completeness(req.data))


@app.post("/scenario/reset", response_model=Scenario)
def reset_scenario() -> Scenario:
    """Discard the ingested scenario and return to the seed."""
    global _current_scenario
    _current_scenario = None
    try:
        from app.services.state import clear_state
        clear_state()
    except Exception:  # noqa: BLE001
        pass
    # Reset is the deterministic demo/test seed; a fresh install still boots
    # the comprehensive university from get_current_scenario().
    scenario = load_seed_scenario()
    _set_current_scenario(scenario)
    return scenario


@app.post("/scenario/department", response_model=Scenario)
def department_scenario() -> Scenario:
    """Load the department-scale scenario (26 instructors, 25 sections,
    3 programs, 12 cohorts) built deterministically from the seed.

    Same engine, real-department scale — the one-click scale proof judges
    can run live. `POST /scenario/reset` returns to the story seed.
    """
    global _current_scenario
    from app.data.department import build_department_scenario
    _set_current_scenario(build_department_scenario(load_seed_scenario()))
    audit.record_event(
        "scenario", "Loaded department-scale scenario "
        f"({len(_current_scenario.instructors)} instructors, "
        f"{len(_current_scenario.sections)} sections, "
        f"{len(_current_scenario.cohorts)} cohorts)", {})
    return _current_scenario


@app.post("/scenario/university", response_model=Scenario)
def university_scenario() -> Scenario:
    """Load the university-scale scenario (38 instructors, 41 sections,
    5 programs, 20 cohorts) — the entire institution on one solve."""
    global _current_scenario
    from app.data.department import build_university_scenario
    _set_current_scenario(build_university_scenario(load_seed_scenario()))
    audit.record_event(
        "scenario", "Loaded university-scale scenario "
        f"({len(_current_scenario.instructors)} instructors, "
        f"{len(_current_scenario.sections)} sections, "
        f"{len(_current_scenario.cohorts)} cohorts)", {})
    return _current_scenario


@app.post("/scenario/full-university", response_model=Scenario)
def full_university_scenario() -> Scenario:
    """Load the full-university stress scenario (198 instructors, 361
    sections, 25 programs, 100 cohorts, ~12,000 students). The native
    solver is the engine that completes this scale; see
    scripts/benchmark.py for the measured comparison."""
    global _current_scenario
    from app.data.department import build_full_university_scenario
    _set_current_scenario(build_full_university_scenario(load_seed_scenario()))
    audit.record_event(
        "scenario", "Loaded full-university scenario "
        f"({len(_current_scenario.instructors)} instructors, "
        f"{len(_current_scenario.sections)} sections, "
        f"{len(_current_scenario.cohorts)} cohorts)", {})
    return _current_scenario


@app.post("/apply", response_model=Scenario)
def apply_request(req: ApplyOpsRequest) -> Scenario:
    """Commit a verified co-pilot/term-change proposal to the current term.

    This is the explicit "accept" step: after it, every later solve builds on
    the new world state instead of silently reverting to the seed.
    """
    global _current_scenario
    base = req.scenario or get_current_scenario()
    ops = list(req.operations)
    if req.remove_instructor_id:
        ops.append(Operation(
            op="remove_instructor", instructor_id=req.remove_instructor_id,
            explanation=f"Remove {req.remove_instructor_id} for the term."))
    for sid, iid in req.pins.items():
        ops.append(Operation(
            op="set_section_instructor", section_id=sid, instructor_id=iid,
            explanation=f"Keep {sid} with {iid}."))
    validated, notes = validate_operations(ops, base)
    scenario = apply_operations(base, validated)
    _set_current_scenario(scenario)
    audit.record_event(
        "apply", f"Applied {len(validated)} operation(s) to the term",
        {"operations": [o.op for o in validated], "notes": notes})
    return scenario


@app.post("/parse", response_model=ParsedRequest)
def parse(req: MessageRequest) -> ParsedRequest:
    scenario = req.scenario or get_current_scenario()
    return ConstraintParser().parse(req.message, scenario, req.speaker_id)


@app.get("/engines")
def engines() -> dict:
    """Registered solver engines behind the standardized interface —
    the Build-step picker and any API client discover them here."""
    from app.solver.engine import list_engines
    return {"engines": list_engines()}


@app.post("/solve", response_model=SolveResult)
def solve_scenario(req: SolveRequest) -> SolveResult:
    from fastapi import HTTPException
    from app.models.scenario import Operation
    from app.solver.engine import ENGINE_IDS
    if req.engine not in ENGINE_IDS:
        raise HTTPException(status_code=400,
                            detail=f"unknown engine {req.engine!r}; available: {ENGINE_IDS}")
    ops, _ = validate_operations(
        [Operation.model_validate(o) for o in (req.operations or [])], req.scenario)
    return solve(req.scenario, ops, engine=req.engine)


class CompareRequest(BaseModel):
    scenario: Optional[Scenario] = None
    operations: Optional[list] = None


@app.post("/solve/compare", response_model=CompareResult)
def solve_compare(req: CompareRequest) -> CompareResult:
    """Run both engines on the same world and diff the timetables."""
    from app.models.scenario import Operation
    scenario = req.scenario or get_current_scenario()
    ops, _ = validate_operations(
        [Operation.model_validate(o) for o in (req.operations or [])], scenario)
    cpsat = solve(scenario, ops, engine="cpsat")
    ours = solve(scenario, ops, engine="ours")
    differing: list[str] = []
    agreement: Optional[float] = None
    if cpsat.timetable and ours.timetable:
        a = {p.section_id: (p.instructor_id, tuple(p.days), p.period, p.room_id)
             for p in cpsat.timetable.placements}
        b = {p.section_id: (p.instructor_id, tuple(p.days), p.period, p.room_id)
             for p in ours.timetable.placements}
        differing = sorted(sid for sid in a if a[sid] != b.get(sid))
        agreement = round(100.0 * (len(a) - len(differing)) / max(1, len(a)), 1)
    from app.solver.engine import rank_results
    winner, verdict = rank_results([("cpsat", cpsat), ("ours", ours)])
    return CompareResult(
        cpsat=cpsat, ours=ours,
        same_status=cpsat.status == ours.status,
        agreement_pct=agreement,
        differing_sections=differing,
        objective_delta=(ours.objective - cpsat.objective)
        if cpsat.objective is not None and ours.objective is not None else None,
        speed_ratio=round(ours.solve_time_ms / cpsat.solve_time_ms, 2)
        if cpsat.solve_time_ms else None,
        winner=winner, verdict=verdict,
    )


class OptionsRequest(BaseModel):
    scenario: Optional[Scenario] = None
    operations: Optional[list] = None


class PinRequest(BaseModel):
    scenario: Optional[Scenario] = None
    # section_id -> {"instructor_id", "room_id", "period" (MWF/TTh) or "day" (block)}
    pins: dict[str, dict] = {}


@app.post("/schedule/options", response_model=list[SolveResult])
def schedule_options(req: OptionsRequest) -> list[SolveResult]:
    """A few schedule options: the same hard constraints, different objectives
    (preference-optimal, balanced faculty load, tightest room fit)."""
    scenario = req.scenario or get_current_scenario()
    ops, _ = validate_operations(
        [Operation.model_validate(o) for o in (req.operations or [])], scenario)
    return [solve(scenario, ops, objective=name)
            for name in ("preference", "balanced_load", "room_fit")]


@app.post("/schedule/pin", response_model=SolveResult)
def schedule_pin(req: PinRequest) -> SolveResult:
    """Keep chosen placements (pin them) and re-solve the rest — 'what to keep'."""
    scenario = req.scenario or get_current_scenario()
    pins_exact: dict[str, tuple[str, int, str]] = {}
    for sid, pin in req.pins.items():
        section = scenario.section_by_id(sid)
        course = scenario.course(section.course_id)
        key = pin.get("period") if course.pattern in ("MWF", "TTh") else pin.get("day")
        if pin.get("instructor_id") and key is not None and pin.get("room_id"):
            pins_exact[sid] = (pin["instructor_id"], key, pin["room_id"])
    return solve(scenario, pins_exact=pins_exact)


@app.post("/copilot", response_model=CopilotResponse)
def copilot(req: MessageRequest) -> CopilotResponse:
    scenario = req.scenario or get_current_scenario()
    return run_copilot(scenario, req.message, speaker_id=req.speaker_id)


@app.post("/student/plan", response_model=StudentPlanResponse)
def student_plan(req: StudentPlanRequest) -> StudentPlanResponse:
    """Suggest a student's personal schedule: Muse Spark parses their life
    constraints; an exact selector proves a conflict-free plan against the
    placed timetable (see services/student_plan.py)."""
    scenario = req.scenario or get_current_scenario()
    try:
        return suggest_student_plan(
            scenario, req.cohort_id, req.message,
            target_override=req.target_courses,
            program_id=req.program_id,
            study_record=req.study_record,
            completed_course_ids=req.completed_course_ids)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/term-change", response_model=TermChangeResponse)
def term_change(req: MessageRequest) -> TermChangeResponse:
    scenario = req.scenario or get_current_scenario()
    return run_term_change(scenario, req.message)


class TranscriptDraft(BaseModel):
    """A voice note, transcribed to a draft — and nothing more.

    Identity comes from the signed-in session, never from a voice: anyone
    can sound like Prof. Chen on a recording, so a transcript is treated as
    untrusted text until a signed-in coordinator reviews, edits, and submits
    it through the normal (verified) term-change flow.
    """

    transcript: str
    detail: str = ("Draft only — voice never changes the term by itself. "
                   "Review and submit this text as a typed request.")


@app.post("/term-change/audio", response_model=TranscriptDraft)
async def term_change_audio(file: UploadFile = File(...)) -> TranscriptDraft:
    """Voice note -> Muse Voice Transcribe -> a reviewable text draft.

    Deliberately does NOT run the term change: speaker identity cannot be
    established from audio, so the transcript enters the same human-reviewed
    path as typed text (see TranscriptDraft)."""
    audio = await file.read()
    transcript = transcribe_wav(audio, file.filename or "voice-note.wav")
    return TranscriptDraft(transcript=transcript)


# --- multi-user: accounts, published schedules, instructor change requests ---

class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    email: str
    password: str
    role: str = "instructor"  # coordinator | instructor | student
    display_name: str = ""
    instructor_id: Optional[str] = None
    cohort_id: Optional[str] = None


class PublishRequest(BaseModel):
    engine: str = "cpsat"


class ChangeRequestIn(BaseModel):
    message: str = ""
    # Structured intake: the exact typed operations picked in the professor's
    # availability grid. When present they are verified as-is at decision
    # time — no re-parse, no silent edits.
    operations: Optional[list[Operation]] = None


class ClosuresIn(BaseModel):
    closures: list[TermClosure]


class TermWindowIn(BaseModel):
    term: Optional[str] = None
    opens_at: Optional[str] = None
    deadline: Optional[str] = None
    weeks: Optional[int] = None
    status: Optional[str] = None


class IntakeSubmitIn(BaseModel):
    hard_unavailable: list[dict] = []
    preferences: list[dict] = []
    note: str = ""
    instructor_id: Optional[str] = None  # coordinator submitting on behalf


class EntityPatchIn(BaseModel):
    kind: str
    id: str
    patch: dict = {}


class TermOptionsIn(BaseModel):
    options: dict = {}


class DecideRequest(BaseModel):
    action: str = "apply"  # apply | reject


def _current_user(authorization: Optional[str] = Header(None)):
    from app.services.auth import user_for_token
    token = ""
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:]
    user = user_for_token(token)
    if user is None:
        raise HTTPException(status_code=401, detail="Login required.")
    return user


def _require_role(user, *roles: str):
    if user.role not in roles:
        raise HTTPException(status_code=403,
                            detail=f"This action needs role: {' or '.join(roles)}.")


@app.post("/auth/register")
def auth_register(req: RegisterRequest) -> dict:
    from app.services.auth import create_session, create_user, find_user, public_user
    init_db()
    if req.role not in ("coordinator", "instructor", "student"):
        raise HTTPException(status_code=400, detail="Unknown role.")
    if find_user(req.email):
        raise HTTPException(status_code=409, detail="Email already registered.")
    scenario = get_current_scenario()
    if req.role == "instructor" and req.instructor_id:
        if req.instructor_id not in {i.id for i in scenario.instructors}:
            raise HTTPException(status_code=400, detail="Unknown instructor_id.")
    if req.role == "student" and req.cohort_id:
        if req.cohort_id not in {c.id for c in scenario.cohorts}:
            raise HTTPException(status_code=400, detail="Unknown cohort_id.")
    user = create_user(req.email, req.password, req.role, req.display_name,
                       instructor_id=req.instructor_id, cohort_id=req.cohort_id)
    return {"token": create_session(user.id), "user": public_user(user)}


@app.post("/auth/login")
def auth_login(req: LoginRequest) -> dict:
    from app.services.auth import create_session, find_user, public_user, verify_password
    init_db()
    user = find_user(req.email)
    if user is None and req.email.lower().endswith("@schedulesolve.demo"):
        from app.services.auth import seed_demo_users
        seed_demo_users(get_current_scenario())
        user = find_user(req.email)
    if user is None or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    return {"token": create_session(user.id), "user": public_user(user)}


@app.get("/auth/me")
def auth_me(authorization: Optional[str] = Header(None)) -> dict:
    from app.services.auth import public_user
    return {"user": public_user(_current_user(authorization))}


@app.post("/auth/logout")
def auth_logout(authorization: Optional[str] = Header(None)) -> dict:
    from app.services.auth import delete_session
    if authorization and authorization.lower().startswith("bearer "):
        delete_session(authorization[7:])
    return {"ok": True}


def _latest_published():
    from app.db import SessionLocal
    from app.models.auth import PublishedSchedule
    with SessionLocal() as session:
        row = session.query(PublishedSchedule).order_by(
            PublishedSchedule.id.desc()).first()
        if row:
            session.expunge(row)
        return row


def _publish_current(engine: str, created_by: str) -> dict:
    from app.db import SessionLocal
    from app.models.auth import PublishedSchedule
    scenario = get_current_scenario()
    result = solve(scenario, engine=engine)
    if result.timetable is None:
        raise HTTPException(status_code=422,
                            detail=f"Current scenario solves as {result.status}; nothing to publish.")
    with SessionLocal() as session:
        row = PublishedSchedule(
            scenario_json=scenario.model_dump_json(),
            timetable_json=result.timetable.model_dump_json(),
            engine=engine, objective=result.objective, status=result.status,
            created_by=created_by)
        session.add(row)
        session.commit()
        session.refresh(row)
        published_id = row.id
    return {"id": published_id, "engine": engine, "status": result.status,
            "objective": result.objective,
            "sections": len(result.timetable.placements)}


@app.post("/schedule/publish")
def schedule_publish(req: PublishRequest,
                     authorization: Optional[str] = Header(None)) -> dict:
    user = _current_user(authorization)
    _require_role(user, "coordinator")
    return _publish_current(req.engine, user.email)


@app.get("/schedule/current")
def schedule_current(authorization: Optional[str] = Header(None)) -> dict:
    _current_user(authorization)
    row = _latest_published()
    if row is None:
        raise HTTPException(status_code=404, detail="No schedule published yet.")
    return {"id": row.id, "engine": row.engine, "status": row.status,
            "objective": row.objective, "created_by": row.created_by,
            "timetable": json.loads(row.timetable_json)}


@app.get("/schedule/mine")
def schedule_mine(authorization: Optional[str] = Header(None)) -> dict:
    """The caller's personal timetable, filtered from the published one."""
    user = _current_user(authorization)
    row = _latest_published()
    if row is None:
        raise HTTPException(status_code=404, detail="No schedule published yet.")
    timetable = json.loads(row.timetable_json)
    placements = timetable["placements"]
    scenario = Scenario.model_validate_json(row.scenario_json)
    if user.role == "instructor":
        placements = [p for p in placements
                      if p["instructor_id"] == user.instructor_id]
        scope = f"Sections taught by {user.display_name}"
    elif user.role == "student":
        cohort = next((c for c in scenario.cohorts if c.id == user.cohort_id), None)
        course_ids = set(scenario.cohort_term_courses(cohort)) if cohort else set()
        placements = [p for p in placements if p["course_id"] in course_ids]
        scope = f"Courses for cohort {(user.cohort_id or '').upper()} this term"
    else:
        scope = "Full institutional timetable (coordinator)"
    load = None
    if user.role == "instructor" and user.instructor_id:
        inst = next((i for i in scenario.instructors
                     if i.id == user.instructor_id), None)
        if inst is not None:
            load = {"current": len(placements),
                    "preps": len({p["course_id"] for p in placements}),
                    "max_sections": inst.max_sections,
                    "max_preps": inst.max_preps,
                    "hard_unavailable": [s.model_dump() for s in inst.hard_unavailable],
                    "preferences": [pr.model_dump() for pr in inst.preferences]}
    return {"id": row.id, "role": user.role, "scope": scope,
            "status": row.status, "objective": row.objective,
            "placements": placements, "load": load}


@app.post("/me/change-requests")
def create_change_request(req: ChangeRequestIn,
                          authorization: Optional[str] = Header(None)) -> dict:
    user = _current_user(authorization)
    _require_role(user, "instructor", "coordinator")
    from app.db import SessionLocal
    from app.models.auth import ChangeRequest

    operations_json: Optional[str] = None
    message = (req.message or "").strip()
    if req.operations:
        if user.role != "instructor" or not user.instructor_id:
            raise HTTPException(status_code=403,
                                detail="Structured intake is per-professor: sign in as the instructor.")
        # A professor constrains only themselves — never a colleague, never
        # a room, never the whole campus (closures are the coordinator's).
        allowed = {"add_instructor_unavailability", "add_instructor_preference",
                   "set_load_cap", "set_prep_cap"}
        ops = [op.model_copy(update={"instructor_id": user.instructor_id})
               for op in req.operations if op.op in allowed]
        ops, notes = validate_operations(ops, get_current_scenario())
        if not ops:
            raise HTTPException(status_code=422,
                                detail="No valid intake operations. " + " ".join(notes))
        operations_json = json.dumps([op.model_dump() for op in ops])
        summary = "; ".join(op.explanation for op in ops)
        message = f"{message}\n{summary}".strip() if message else summary
    if not message:
        raise HTTPException(status_code=422, detail="Write a request or pick availability first.")
    with SessionLocal() as session:
        row = ChangeRequest(user_id=user.id, instructor_id=user.instructor_id,
                            message=message, operations=operations_json)
        session.add(row)
        session.commit()
        session.refresh(row)
        request_id = row.id
    audit.record_event("change-request",
                       f"{user.display_name} requested: {message[:120]}",
                       {"request_id": request_id,
                        "structured": bool(operations_json)})
    return {"id": request_id, "status": "pending",
            "structured": bool(operations_json)}


def _change_request_dict(row, requester_email: str = "") -> dict:
    operations = None
    if row.operations:
        try:
            operations = json.loads(row.operations)
        except (TypeError, ValueError):
            operations = None
    return {"id": row.id, "instructor_id": row.instructor_id,
            "requester": requester_email, "message": row.message,
            "operations": operations,
            "kind": "structured" if operations else "message",
            "status": row.status, "result_summary": row.result_summary,
            "created_at": row.created_at.isoformat() if row.created_at else None}


@app.get("/me/change-requests")
def my_change_requests(authorization: Optional[str] = Header(None)) -> dict:
    user = _current_user(authorization)
    from app.db import SessionLocal
    from app.models.auth import ChangeRequest
    with SessionLocal() as session:
        rows = session.query(ChangeRequest).filter(
            ChangeRequest.user_id == user.id).order_by(
            ChangeRequest.id.desc()).all()
        return {"requests": [_change_request_dict(r, user.email) for r in rows]}


@app.get("/change-requests")
def all_change_requests(authorization: Optional[str] = Header(None)) -> dict:
    user = _current_user(authorization)
    _require_role(user, "coordinator")
    from app.db import SessionLocal
    from app.models.auth import ChangeRequest, User
    # Staff-load context for the queue: current published load vs contract cap.
    scenario = get_current_scenario()
    caps = {i.id: i.max_sections for i in scenario.instructors}
    loads: dict[str, int] = {}
    latest = _latest_published()
    if latest is not None:
        for p in json.loads(latest.timetable_json)["placements"]:
            loads[p["instructor_id"]] = loads.get(p["instructor_id"], 0) + 1
    with SessionLocal() as session:
        rows = session.query(ChangeRequest).order_by(
            ChangeRequest.id.desc()).all()
        emails = {u.id: u.email for u in session.query(User).all()}
        out = []
        for r in rows:
            d = _change_request_dict(r, emails.get(r.user_id, ""))
            if r.instructor_id:
                d["load"] = {"current": loads.get(r.instructor_id, 0),
                             "max_sections": caps.get(r.instructor_id)}
            out.append(d)
        return {"requests": out}


@app.post("/change-requests/{request_id}/decide")
def decide_change_request(request_id: int, req: DecideRequest,
                          authorization: Optional[str] = Header(None)) -> dict:
    """Coordinator decision. 'apply' runs the verified co-pilot loop on the
    instructor's message; only solver-proven changes are committed, then the
    schedule is re-published so the instructor sees the result."""
    global _current_scenario
    user = _current_user(authorization)
    _require_role(user, "coordinator")
    from datetime import datetime, timezone
    from app.db import SessionLocal
    from app.models.auth import ChangeRequest
    with SessionLocal() as session:
        row = session.query(ChangeRequest).filter(
            ChangeRequest.id == request_id).first()
        if row is None:
            raise HTTPException(status_code=404, detail="Change request not found.")
        if row.status != "pending":
            raise HTTPException(status_code=409, detail="Already decided.")
        message, instructor_id = row.message, row.instructor_id
        structured_ops = None
        if row.operations:
            try:
                structured_ops = [Operation.model_validate(o)
                                  for o in json.loads(row.operations)]
            except (TypeError, ValueError):
                structured_ops = None
        if req.action == "apply" and structured_ops is not None:
            # Structured intake: the professor picked these exact operations.
            # The solver verifies them as-is — feasible means applied,
            # infeasible means rejected with the proof translated. No
            # re-parse and no silent dropping (that is the free-text path).
            ops, _notes = validate_operations(structured_ops,
                                              get_current_scenario())
            result = solve(get_current_scenario(), ops)
            if ops and result.status != "infeasible":
                _set_current_scenario(apply_operations(get_current_scenario(), ops))
                published = _publish_current("cpsat", user.email)
                row.status = "applied"
                row.result_summary = (
                    f"Structured intake verified by the solver: {result.status} "
                    f"(penalty {result.objective}). Applied {len(ops)} picked "
                    f"operation(s) and re-published as schedule #{published['id']}.")
            else:
                explanation = None
                if result.conflicts is not None:
                    from app.agent.explainer import ConflictExplainer
                    diag, _mode = ConflictExplainer().explain(
                        get_current_scenario(), message, ops, result.conflicts)
                    explanation = diag.explanation
                row.status = "rejected"
                row.result_summary = (
                    explanation or
                    "The solver proved this intake infeasible; nothing was applied.")
            row.decided_at = datetime.now(timezone.utc).replace(tzinfo=None)
            session.commit()
            session.refresh(row)
            return _change_request_dict(row)
        if req.action == "reject":
            row.status = "rejected"
            row.result_summary = "Rejected by coordinator."
            row.decided_at = datetime.now(timezone.utc).replace(tzinfo=None)
            session.commit()
            return _change_request_dict(row)
        response = run_copilot(get_current_scenario(), message,
                               speaker_id=instructor_id)
        if response.result is not None and response.applied_operations:
            ops, _notes = validate_operations(
                [Operation.model_validate(o) if isinstance(o, dict) else o
                 for o in response.applied_operations], get_current_scenario())
            _set_current_scenario(apply_operations(get_current_scenario(), ops))
            published = _publish_current("cpsat", user.email)
            row.status = "applied"
            row.result_summary = (
                f"{response.summary} Re-solved {published['status']} "
                f"(penalty {published['objective']}) and re-published as "
                f"schedule #{published['id']}.")
        else:
            row.status = "rejected"
            row.result_summary = (
                response.explanation or
                "The solver could not prove this change; nothing was applied. "
                + " ".join(response.healing_notes))
        row.decided_at = datetime.now(timezone.utc).replace(tzinfo=None)
        session.commit()
        session.refresh(row)
        return _change_request_dict(row)


@app.post("/term/closures")
def set_term_closures(req: ClosuresIn,
                      authorization: Optional[str] = Header(None)) -> dict:
    """Coordinator sets the term's holidays / campus closures. Closures are
    weekday-shaped (the timetable is a weekly pattern); they take effect on
    the next solve/publish — the solver never places a section in a closed
    slot. Returns the updated scenario."""
    global _current_scenario
    user = _current_user(authorization)
    _require_role(user, "coordinator")
    sc = get_current_scenario().model_copy(deep=True)
    seen: set[tuple[int, int | None]] = set()
    closures: list[TermClosure] = []
    for c in req.closures:
        key = (c.day, c.period)
        if key not in seen:
            seen.add(key)
            closures.append(c)
    sc.closures = closures
    _set_current_scenario(sc)
    audit.record_event("closures",
                       f"Term closures set: {len(closures)} slot(s) closed",
                       {"closures": [c.model_dump() for c in closures]})
    return {"scenario": sc.model_dump()}


# --- pre-term intake window + institution model ------------------------------

def _window_payload(scenario: Scenario, user) -> dict:
    state = term_service.window_state(scenario)
    if user.role == "instructor":
        state["submissions"] = [
            row for row in state["submissions"]
            if row["instructor_id"] == user.instructor_id
        ]
    state["role"] = user.role
    state["instructor_id"] = user.instructor_id
    return state


def _overview_payload() -> dict:
    latest = _latest_published()
    placements = None
    if latest is not None:
        try:
            placements = json.loads(latest.timetable_json)["placements"]
        except (TypeError, ValueError, KeyError):
            placements = None
    return term_service.overview(get_current_scenario(), placements)


@app.get("/term/window")
def term_window(authorization: Optional[str] = Header(None)) -> dict:
    """The pre-term intake window: deadline, status and submissions."""
    user = _current_user(authorization)
    return _window_payload(get_current_scenario(), user)


@app.post("/term/window")
def term_window_update(req: TermWindowIn,
                       authorization: Optional[str] = Header(None)) -> dict:
    user = _current_user(authorization)
    _require_role(user, "coordinator")
    term_service.set_window(
        get_current_scenario(),
        term=req.term, opens_at=req.opens_at, deadline=req.deadline,
        weeks=req.weeks, status=req.status,
    )
    audit.record_event("term-window", "Intake window updated",
                       req.model_dump(exclude_none=True))
    return _window_payload(get_current_scenario(), user)


@app.post("/term/window/open")
def term_window_open(authorization: Optional[str] = Header(None)) -> dict:
    user = _current_user(authorization)
    _require_role(user, "coordinator")
    term_service.open_window(get_current_scenario())
    audit.record_event("term-window", "Faculty intake window opened", {})
    return _window_payload(get_current_scenario(), user)


@app.post("/term/window/close")
def term_window_close(authorization: Optional[str] = Header(None)) -> dict:
    user = _current_user(authorization)
    _require_role(user, "coordinator")
    term_service.close_window(get_current_scenario())
    audit.record_event("term-window", "Faculty intake window closed", {})
    return _window_payload(get_current_scenario(), user)


@app.post("/term/window/accept")
def term_window_accept(authorization: Optional[str] = Header(None)) -> dict:
    """Accept every faculty submission and build the institution model."""
    global _current_scenario
    user = _current_user(authorization)
    _require_role(user, "coordinator")
    try:
        updated, summary = term_service.accept_window(get_current_scenario())
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    _set_current_scenario(updated)
    audit.record_event(
        "term-accepted",
        f"Accepted {summary['accepted']} faculty submission(s) for {summary['term']}",
        summary,
    )
    return {
        "window": _window_payload(updated, user),
        "summary": summary,
        "scenario": updated.model_dump(),
    }


@app.post("/term/window/submit")
def term_window_submit(req: IntakeSubmitIn,
                       authorization: Optional[str] = Header(None)) -> dict:
    """A faculty member submits hard constraints + soft preferences."""
    user = _current_user(authorization)
    if user.role == "instructor":
        instructor_id = user.instructor_id
    elif user.role == "coordinator" and req.instructor_id:
        instructor_id = req.instructor_id
    else:
        raise HTTPException(status_code=403, detail="Sign in as the instructor to submit.")
    if not instructor_id:
        raise HTTPException(status_code=400, detail="No instructor linked to this account.")
    try:
        submission = term_service.submit_intake(
            get_current_scenario(), instructor_id,
            hard_unavailable=req.hard_unavailable,
            preferences=req.preferences,
            note=req.note,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    audit.record_event(
        "faculty-intake",
        f"{submission['instructor_name']} submitted {submission['hard_count']} hard "
        f"and {submission['preference_count']} soft constraint(s)",
        {"instructor_id": instructor_id},
    )
    return {"submission": submission,
            "window": _window_payload(get_current_scenario(), user)}


@app.post("/term/window/options")
def term_window_options(req: TermOptionsIn,
                        authorization: Optional[str] = Header(None)) -> dict:
    """Persist schedule/calendar settings (engine, start/end, auto-publish)."""
    user = _current_user(authorization)
    _require_role(user, "coordinator")
    term_service.set_options(get_current_scenario(), req.options)
    audit.record_event("term-options", "Schedule options saved", req.options)
    return _window_payload(get_current_scenario(), user)


@app.get("/institution/overview")
def institution_overview(authorization: Optional[str] = Header(None)) -> dict:
    """Everything the system understands: campus, buildings, rooms, halls,
    faculty, load rules, weeks, holidays, constraints and degree maps."""
    _current_user(authorization)
    return _overview_payload()


@app.patch("/institution/entity")
def institution_update(req: EntityPatchIn,
                       authorization: Optional[str] = Header(None)) -> dict:
    """Coordinator double-checks/edits an entity in the institution model."""
    global _current_scenario
    user = _current_user(authorization)
    _require_role(user, "coordinator")
    try:
        updated = term_service.update_entity(
            get_current_scenario(), req.kind, req.id, req.patch)
    except (ValueError, KeyError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _set_current_scenario(updated)
    audit.record_event("institution-edit", f"Edited {req.kind} {req.id}", req.patch)
    return {"scenario": updated.model_dump(), "overview": _overview_payload()}


@app.delete("/institution/entity")
def institution_delete(kind: str, id: str,
                       authorization: Optional[str] = Header(None)) -> dict:
    global _current_scenario
    user = _current_user(authorization)
    _require_role(user, "coordinator")
    try:
        updated = term_service.delete_entity(get_current_scenario(), kind, id)
    except (ValueError, KeyError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _set_current_scenario(updated)
    audit.record_event("institution-delete", f"Removed {kind} {id}", {})
    return {"scenario": updated.model_dump(), "overview": _overview_payload()}


# --- intelligence services: sparse matrices, spectral radar, AI tightening ----

class TightenRequest(BaseModel):
    scenario: Optional[Scenario] = None
    operations: Optional[list] = None


@app.get("/intelligence/matrices", response_model=MatricesReport)
def intelligence_matrices() -> MatricesReport:
    """Every entity relationship as a scipy sparse matrix (COO on the wire)."""
    return build_matrices(get_current_scenario()).to_report()


@app.get("/intelligence/spectral", response_model=SpectralReport)
def intelligence_spectral() -> SpectralReport:
    """Spectral radar: conflict-graph spectrum, deadlock warnings, warm-start hints."""
    return analyze(get_current_scenario())


@app.get("/intelligence/margins", response_model=MarginsReport)
def intelligence_margins() -> MarginsReport:
    """C39 four-course guarantee, audited against a fresh CP-SAT solve."""
    scenario = get_current_scenario()
    result = solve(scenario)
    return compute_margins(scenario, result.timetable, config.MIN_COURSES_PER_COHORT)


@app.get("/intelligence/utilization", response_model=UtilizationReport)
def intelligence_utilization() -> UtilizationReport:
    """Campus (room) + faculty utilization against a fresh CP-SAT solve."""
    scenario = get_current_scenario()
    result = solve(scenario)
    return compute_utilization(scenario, result.timetable)


@app.get("/planning/whatif/{change_id}", response_model=WhatIfReport)
def planning_whatif(change_id: str) -> WhatIfReport:
    """What-if planning: simulate a change (new lab, growth, repurpose) and
    report the before/after impact."""
    return whatif(get_current_scenario(), change_id)


@app.post("/intelligence/tighten", response_model=TightenResponse)
def intelligence_tighten(req: TightenRequest) -> TightenResponse:
    """Muse proposes typed repair moves; CP-SAT verifies every one."""
    scenario = req.scenario or get_current_scenario()
    ops, _ = validate_operations(
        [Operation.model_validate(o) for o in (req.operations or [])], scenario)
    return run_tightener(scenario, ops)
