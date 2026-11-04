"""Intelligence-layer result types: sparse matrix payloads, spectral radar,
four-course offering margins, and AI tightening moves.

Everything here is API-serializable (plain lists/floats — numpy stays behind
the builders) and flat, like the rest of the model contracts, because Meta
Model API structured output rejects recursive schemas.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class SparseMatrixPayload(BaseModel):
    """A sparse matrix on the wire: COO triplets + axis labels + stats."""

    name: str
    shape: tuple[int, int]
    row_labels: list[str]
    col_labels: list[str]
    rows: list[int]
    cols: list[int]
    values: list[float]
    nnz: int
    density: float
    notes: str = ""


class CohortDepth(BaseModel):
    """Where a cohort stands on its degree roadmap ("how far along")."""

    cohort_id: str
    name: str
    size: int
    current_term: int
    total_terms: int
    terms_remaining: int
    completion_fraction: float
    plan_courses: list[str]      # required + electives for the current term
    pool_courses: list[str]      # plan + prerequisite-chain-closed future courses


class MatricesReport(BaseModel):
    """All sparse matrices of the scenario in one payload."""

    classroom: SparseMatrixPayload          # rooms x courses, value = seat headroom
    fulfilment: SparseMatrixPayload         # cohorts x courses, value = depth gap
    demand: SparseMatrixPayload             # cohorts x courses, value = projected enrollment
    cohort_sections: SparseMatrixPayload    # cohorts x sections, 1 = takeable now
    faculty_availability: SparseMatrixPayload  # instructors x (day,period), 1 = free
    faculty_blackouts: SparseMatrixPayload  # instructors x (day,period), 1 = hard blackout
    faculty_preferences: SparseMatrixPayload   # instructors x (day,period), signed weight
    qualification: SparseMatrixPayload      # instructors x courses, 1 = qualified
    department_capacity: list[list[float]]  # 5x4 heatmap: available instructors per slot
    dead_zones: list[tuple[int, int]]       # (day, period) slots with zero supply
    depth: list[CohortDepth]


class GraphEdge(BaseModel):
    u: str                      # section id
    v: str                      # section id
    weight: float
    kind: Literal["cohort", "instructor"]  # hard (must-not-overlap) vs potential


class SpectralReport(BaseModel):
    """Spectral radar over the section-conflict graph."""

    node_labels: list[str]
    edges: list[GraphEdge]
    laplacian_eigenvalues: list[float]
    algebraic_connectivity: float      # mu_2: 0 => decomposable islands
    largest_laplacian_eigenvalue: float
    hoffman_chromatic_lower_bound: float
    max_clique: list[str]              # exact (Bron-Kerbosch) at department scale
    fiedler_vector: list[float]
    spectral_order: list[str]          # Fiedler-sorted sections (solve order)
    components: list[list[str]]        # independent scheduling islands
    spectral_partition: tuple[list[str], list[str]]  # Fiedler sign split
    deadlock_warnings: list[str]
    slot_hints: dict[str, int]         # spectral coloring -> CP-SAT warm start


class CohortMargin(BaseModel):
    """The four-course guarantee (C39) audited against a placed timetable."""

    cohort_id: str
    name: str
    size: int
    terms_remaining: int
    plan_courses: list[str]
    pool_courses: list[str]
    offered_pool_courses: list[str]    # pool courses with >=1 placed section
    margin: int                        # max mutually non-overlapping distinct courses
    ok: bool                           # margin >= min_courses
    example_track: list[str]           # one full-time course selection
    risk: str


class MarginsReport(BaseModel):
    min_courses: int
    cohorts: list[CohortMargin]
    all_ok: bool


class RoomUtilization(BaseModel):
    room_id: str
    name: str
    capacity: int
    peak_seats: int          # peak simultaneous seats (a room hosts one section/slot)
    utilization: float       # peak_seats / capacity


class FacultyLoad(BaseModel):
    instructor_id: str
    name: str
    load: int
    max_sections: int
    satisfied: bool          # within contract cap
    utilization: float       # load / max_sections


class UtilizationReport(BaseModel):
    room_utilization: float          # scheduled seats / total capacity
    rooms: list[RoomUtilization]
    faculty: list[FacultyLoad]
    none_over_cap: bool              # no instructor exceeds max_sections (a ceiling, not a quota)
    cap_slots: int                   # sum of max_sections across faculty
    cap_filled: int                  # sum of assigned sections


class WhatIfReport(BaseModel):
    """Before/after impact of a hypothetical change (new room, growth, repurpose)."""

    change_id: str
    label: str
    description: str
    before_status: str                # feasible / optimal / infeasible
    after_status: str
    before_utilization: float
    after_utilization: float
    before_loads: dict[str, int]      # instructor_id -> sections
    after_loads: dict[str, int]
    before_margins_ok: bool
    after_margins_ok: bool
    verdict: str


class TighteningMove(BaseModel):
    """One AI-proposed, solver-verified repair of a deadlock or shortfall."""

    kind: Literal[
        "raise_load_cap",
        "add_section",
        "add_qualification",
        "open_elective",
        "drop_request",
    ]
    instructor_id: Optional[str] = None
    course_id: Optional[str] = None
    cohort_id: Optional[str] = None
    op_index: Optional[int] = Field(default=None, ge=0)
    rationale: str = ""
    verified: bool = False
    detail: str = ""                   # verification outcome


class TightenResponse(BaseModel):
    trigger: Literal["infeasible", "margin_shortfall", "deadlock_warning", "none"]
    evidence: list[str]
    muse_mode: Literal["muse-spark", "deterministic"]
    assessment: str
    moves: list[TighteningMove]
    result: Optional[object] = None    # SolveResult of the best verified move
    margins: Optional[MarginsReport] = None
