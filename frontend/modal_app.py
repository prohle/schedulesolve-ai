"""Modal deployment: the Next.js UI as a public, scale-to-zero web server.

    modal deploy frontend/modal_app.py

The image builds the app with `output: "standalone"` (see next.config.ts),
then serves the traced minimal Node server (`server.js`). The UI's `/api/*`
route handlers proxy server-side to the backend Modal app via `BACKEND_URL`,
so the browser never talks to the Python service directly and no CORS
change is needed. Scale-to-zero like the backend; warm it with one request.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

import modal

FRONTEND_DIR = Path(__file__).parent
BACKEND_API_URL = "https://prohle--schedulesolve-ai-api.us-east.modal.run"

app = modal.App("schedulesolve-ai-ui")


def _ignore(path: Path) -> bool:
    return any(part in ("node_modules", ".next", ".git") for part in path.parts)


image = (
    modal.Image.from_registry("node:20-slim", add_python="3.12")
    .workdir("/app")
    .add_local_dir(FRONTEND_DIR, remote_path="/app", copy=True, ignore=_ignore)
    .run_commands(
        "npm ci",
        "npm run build",
        "cp -r public .next/standalone/public",
        "cp -r .next/static .next/standalone/.next/static",
        env={"NEXT_TELEMETRY_DISABLED": "1"},
    )
)


@app.function(
    image=image,
    env={
        "BACKEND_URL": BACKEND_API_URL,
        "PORT": "3000",
        "HOSTNAME": "0.0.0.0",
    },
    timeout=300,          # proxied Muse calls can take 30-90s
    cpu=1,
    memory=1024,
    max_containers=1,     # cap cost; the demo is single-tenant
    min_containers=1,     # KEEP WARM for judging (Nov 5-8, ~$0.055/h).
                          # REVERT to 0 on Nov 9.
)
@modal.web_server(3000, startup_timeout=180)
def web():
    subprocess.Popen(["node", ".next/standalone/server.js"], cwd="/app")
