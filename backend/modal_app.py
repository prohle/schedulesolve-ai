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
    # Chat runs on open-weight Muse Spark Open via Baseten; voice ASR still
    # uses the Meta Model API key. Keeping them in one secret avoids two
    # MODEL_API_KEY entries fighting over the chat client.
    secrets=[modal.Secret.from_name("baseten-api")],
    volumes={"/data": volume},
    env={
        "DATABASE_URL": "sqlite:////data/schedulesolve.db",
        "ALLOW_SQLITE": "1",
        "MUSE_BASE_URL": "https://inference.baseten.co/v1",
        "MUSE_MODEL": "meta-models/muse-spark-open-1026",
        "MUSE_ASR_BASE_URL": "https://api.meta.ai/v1",
        "MUSE_ASR_MODEL": "muse-voice-transcribe-1.0",
        "MUSE_REASONING_EFFORT": "low",
        # Cost guard: durable daily weighted budget + per-identity limits.
        "DEMO_DAILY_MODEL_BUDGET": "300",
    },
    timeout=300,          # Muse calls can take 30-90s
    cpu=2,                # headroom for concurrent judges + pymupdf page rendering
    memory=4096,          # keep 4 GiB: pymupdf page rendering for scanned PDFs
    max_containers=1,     # cap cost and concurrency; the demo is single-tenant
    min_containers=1,     # KEEP WARM for judging (Nov 5-8, ~$0.079/h).
                          # REVERT to 0 on Nov 9. A cold start is ~10-20s and
                          # Demo is 25% of the rubric.
)
@modal.asgi_app()
def api():
    from app.main import app as web_app

    return web_app
