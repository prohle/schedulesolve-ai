"""Modal deployment: the FastAPI backend as a public, scale-to-zero ASGI app.

    cd backend
    modal secret create meta-api MODEL_API_KEY=...
    modal deploy modal_app.py

The UI (Vercel) proxies through its Next.js API routes, so `BACKEND_URL` is the
only setting it needs. SQLite lives on a Modal Volume; reset the demo term with
`POST /scenario/reset`.
"""

from __future__ import annotations

import modal

app = modal.App("schedulesolve-ai")

image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install_from_requirements("requirements.txt")
    .apt_install("g++")
    .add_local_python_source("app", copy=True)
    .add_local_dir("app/data", remote_path="/root/app/data", copy=True)
    .add_local_file("native/schedulesolve_solver.cpp",
                    remote_path="/root/native/schedulesolve_solver.cpp", copy=True)
    .run_commands("g++ -O3 -std=c++17 -o /root/native/solver /root/native/schedulesolve_solver.cpp")
)

volume = modal.Volume.from_name("schedulesolve-data", create_if_missing=True)


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("meta-api")],
    volumes={"/data": volume},
    env={"DATABASE_URL": "sqlite:////data/schedulesolve.db", "ALLOW_SQLITE": "1"},
    timeout=300,          # Muse calls can take 30-90s
    cpu=2,
    memory=4096,
    max_containers=2,     # cap cost; the demo is single-tenant
    min_containers=0,     # scale to zero; warm only around judging
)
@modal.asgi_app()
def api():
    from app.main import app as web_app

    return web_app
