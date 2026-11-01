"""Data-ingestion contract: the flat schema Muse Spark fills from free-form
institutional data (course catalog, degree maps, cohorts, faculty, rooms).

Flat and recursion-free by design (Meta Model API structured output is more
reliable without recursion). A deterministic normalizer
(`app.ingestion.normalize.build_scenario`) turns this into the solver's
`Scenario` — Muse autocleans, the normalizer assembles, CP-SAT schedules.
"""

from __future__ import annotations

from pydantic import BaseModel


class ExtractedCourse(BaseModel):
    code: str
    title: str = ""
    pattern: str = "MWF"        # MWF | TTh | block
    room_type: str = "lecture"  # lecture | lab | seminar
    seats: int = 30
    equipment: list[str] = []
    source: str = ""            # file/section the record came from


class ExtractedInstructor(BaseModel):
    name: str
    qualified_courses: list[str] = []  # course codes they can teach
    max_sections: int = 2
    max_preps: int = 2
    availability: str = ""             # free-form ("unavailable Mondays", ...)
    source: str = ""


class ExtractedRoom(BaseModel):
    name: str
    building: str = ""
    capacity: int = 30
    room_type: str = "lecture"
    equipment: list[str] = []
    source: str = ""


class ExtractedCohort(BaseModel):
    name: str = ""
    program: str = ""
    admission_year: int = 2026
    graduation_year: int = 2030
    current_term: int = 1
    size: int = 30
    source: str = ""


class ExtractedRequirement(BaseModel):
    program: str
    term: int
    course: str     # course code
    required: bool = True
    source: str = ""


class ExtractedDistance(BaseModel):
    from_building: str
    to_building: str
    minutes: int
    source: str = ""


class InstitutionData(BaseModel):
    """Everything Muse extracted from the free-form dump, plus a summary."""

    summary: str = ""
    buildings: list[str] = []
    courses: list[ExtractedCourse] = []
    instructors: list[ExtractedInstructor] = []
    rooms: list[ExtractedRoom] = []
    cohorts: list[ExtractedCohort] = []
    degree_map: list[ExtractedRequirement] = []
    distances: list[ExtractedDistance] = []


class ConflictOption(BaseModel):
    """One way to resolve a data conflict; the user picks the winner."""

    key: str
    label: str
    detail: str = ""


class InstitutionConflict(BaseModel):
    """Two or more extracted records disagree.

    ``sources`` names the file/section and the competing values, so the user
    can see where each side came from before choosing a winner.
    """

    id: str
    kind: str
    entity: str                 # courses | instructors | rooms | cohorts | degree_map | distances
    summary: str
    detail: str = ""
    sources: list[str] = []
    indices: list[int] = []     # indices into the entity list
    options: list[ConflictOption] = []
    default_option: str = ""


class DataChange(BaseModel):
    kind: str                   # added | removed | updated
    entity: str                 # course | instructor | room | cohort | degree_map | building | distance
    key: str
    detail: str = ""


class ChangeReport(BaseModel):
    """What changed between the previous extraction and this one."""

    changes: list[DataChange] = []
    unchanged: bool = False
    initial: bool = False
    summary: str = ""


class DataCheck(BaseModel):
    key: str
    label: str
    provided: bool
    count: int


class CompletenessReport(BaseModel):
    """Which scheduling inputs were found, and what is still missing."""

    checks: list[DataCheck]
    missing: list[str]
    complete: bool