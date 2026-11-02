"""Data ingestion: free-form institutional data -> solver Scenario.

`ingest(text)` runs the Muse Spark (or deterministic) parser and assembles a `Scenario`
via the deterministic normalizer. `check_completeness` reports which of the six
required inputs are present vs missing. This is the "point the tool at messy
data" step: catalog, degree maps, cohorts, faculty, campus, facilities -> clean
structured model -> CP-SAT schedules -> the audit trail monitors.
"""

from app.ingestion.check import REQUIRED_DATA, check_completeness
from app.ingestion.normalize import build_scenario
from app.ingestion.parser import IngestionParser, deterministic_ingest
from app.models.ingestion import InstitutionData
from app.models.scenario import Scenario

__all__ = [
    "IngestionParser", "deterministic_ingest", "build_scenario", "ingest",
    "check_completeness", "REQUIRED_DATA",
]


def ingest(text: str) -> tuple[Scenario, InstitutionData]:
    data = IngestionParser().parse(text)
    return build_scenario(data), data