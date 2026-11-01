import os
from pathlib import Path

from dotenv import load_dotenv

# Load the repo-root .env (and a cwd one if present) so keys never live in code.
_REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(_REPO_ROOT / ".env")
load_dotenv()  # doesn't override already-loaded values

# --- Meta Model API ---------------------------------------------------------
# OpenAI-compatible endpoint. Auth: https://dev.meta.ai dashboard -> API keys.
MUSE_BASE_URL = os.getenv("MUSE_BASE_URL", "https://api.meta.ai/v1")
# Accepts both the documented MODEL_API_KEY and MUSE_API_KEY spellings.
MUSE_API_KEY = os.getenv("MODEL_API_KEY") or os.getenv("MUSE_API_KEY")

# Contributor mode = same model, lower price; content may train future Meta
# models. Fine for synthetic demo data. For a real institution, switch to
# "muse-spark-1.3" (Standard mode) so no staff data ever trains Meta models.
MUSE_MODEL = os.getenv("MUSE_MODEL", "muse-spark-1.3-contributor")

# Parsing is not a deep-reasoning task; low effort keeps token spend down.
MUSE_REASONING_EFFORT = os.getenv("MUSE_REASONING_EFFORT", "low")

# Hard timeout on every Meta API call. A hung/slow response must fail fast so
# the deterministic fallback (mock parser / template explanation / template
# tightening) takes over instead of stalling the co-pilot loop. muse-spark is
# a reasoning model — the tightening prompt can take 40-90s, so this is
# generous rather than tight.
MUSE_TIMEOUT_S = float(os.getenv("MUSE_TIMEOUT_S", "120"))

# --- Data --------------------------------------------------------------------
SEED_SCENARIO_PATH = os.path.join(os.path.dirname(__file__), "data", "seed_scenario.json")

# Persistence: Postgres 18 in Docker (local Compose on 5433, service URL in
# Compose). The database is required; there is no SQLite mode.
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://schedulesolve:schedulesolve@localhost:5433/schedulesolve",
)

SOLVER_TIME_LIMIT_S = float(os.getenv("SOLVER_TIME_LIMIT_S", "10"))

# ScheduleSolve home solver (pure-Python competitor to CP-SAT): wall-clock
# budget per run before it returns its best incumbent as "feasible".
HOME_SOLVER_TIME_LIMIT_S = float(os.getenv("HOME_SOLVER_TIME_LIMIT_S", "5"))

# C39: full-time offering guarantee — every cohort must be able to assemble
# at least this many distinct, non-overlapping courses toward graduation.
MIN_COURSES_PER_COHORT = int(os.getenv("MIN_COURSES_PER_COHORT", "4"))
