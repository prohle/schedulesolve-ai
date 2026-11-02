# Free fallback hosting (if Modal credit runs out)

The primary live demo runs on Modal (see [deploy_modal.md](./deploy_modal.md)).
Modal is cheap at demo traffic (~$0.006 per two-minute judge session) but it
is metered, and the workspace balance is small. This is the escape hatch:
the same backend and UI on free tiers, no card required.

Nothing here changes the repo. Both hosts build from the code that is already
in `main`.

---

## Option 1 — Hugging Face Spaces (backend) + Vercel (UI) — recommended

Free, no card. HF Space: 2 vCPU / 16 GB, sleeps after ~48 h idle and wakes on
the next request (~30 s, comparable to a Modal cold start). Vercel hobby tier
serves the UI.

### 1a. Backend on a Hugging Face Docker Space

1. Create a Space: <https://huggingface.co/new-space> → **SDK: Docker** →
   *Blank* → CPU basic (free).
2. The Space repo needs three things at its root:

   **`README.md`** (front-matter is what makes HF run it as a server):

   ```yaml
   ---
   title: ScheduleSolve AI API
   sdk: docker
   app_port: 8000
   ---

   FastAPI backend for ScheduleSolve AI. See the main repo for the app.
   ```

   **`Dockerfile`** — copy `backend/Dockerfile` verbatim. It already builds the
   native C++ solver and listens on `0.0.0.0:8000`.

   **the source** — `requirements.txt`, `app/`, `native/`.

   ```bash
   # from the repo root
   git clone https://huggingface.co/spaces/<you>/schedulesolve-api /tmp/hf-api
   cp backend/Dockerfile backend/requirements.txt /tmp/hf-api/
   cp -r backend/app backend/native /tmp/hf-api/
   # the Space README carries the YAML front-matter shown above
   printf '%s\n' '---' 'title: ScheduleSolve AI API' 'sdk: docker' 'app_port: 8000' '---' '' 'FastAPI backend for ScheduleSolve AI.' > /tmp/hf-api/README.md
   cd /tmp/hf-api && git add -A && git commit -m "deploy" && git push
   ```

3. Space settings → **Variables and secrets**. Set secrets (not variables) for
   anything with a key:

   | Name | Value |
   |---|---|
   | `ALLOW_SQLITE` | `1` |
   | `DATABASE_URL` | `sqlite:////tmp/schedulesolve.db` |
   | `MODEL_API_KEY` | your Baseten key (`b10_…`) |
   | `MUSE_BASE_URL` | `https://inference.baseten.co/v1` |
   | `MUSE_MODEL` | `meta-models/muse-spark-open-1026` |
   | `MUSE_ASR_BASE_URL` | `https://api.meta.ai/v1` |
   | `MUSE_ASR_MODEL` | `muse-voice-transcribe-1.0` |
   | `MUSE_ASR_API_KEY` | your Meta Model API key |
   | `MUSE_REASONING_EFFORT` | `low` |
   | `DEMO_DAILY_MODEL_BUDGET` | `300` |

   > HF Spaces free storage is ephemeral: the SQLite file resets when the Space
   > restarts. That is fine for a demo (the seed scenario reloads), but the
   > audit ledger starts empty after a restart.

4. Verify: `https://<you>-schedulesolve-api.hf.space/status` → `{"status":"ok"}`.

### 1b. UI on Vercel

1. <https://vercel.com/new> → import `prohle/schedulesolve-ai`.
2. **Root directory: `frontend`.** Framework preset: Next.js (auto-detected).
3. Environment variable `BACKEND_URL=https://<you>-schedulesolve-api.hf.space`.
4. Deploy. The browser never talks to the backend directly — every call goes
   through the Next `/api/*` route handlers, which proxy to `BACKEND_URL`
   server-side, so no CORS change is needed.

### 1c. Swap the links

Update the live-demo URL in `readme.md` (top), `docs/submission.md` (form
field), and the X copy. Leave `deploy_modal.md` in place as the primary.

---

## Option 2 — Google Cloud Run (backend) + Vercel (UI)

Also free at demo volume (2M requests/month), but **requires a billing
account**. Only worth it if you already have GCP set up.

```bash
cd backend
gcloud run deploy schedulesolve-api \
  --source . --region us-central1 --allow-unauthenticated \
  --memory 2Gi --cpu 1 --timeout 300 \
  --set-env-vars ALLOW_SQLITE=1,MUSE_BASE_URL=https://inference.baseten.co/v1,MUSE_MODEL=meta-models/muse-spark-open-1026 \
  --set-secrets MODEL_API_KEY=baseten-key:latest
```

Cloud Run injects `PORT`; the container listens on 8000, so pass
`--port 8000`. SQLite on Cloud Run is ephemeral (same caveat as HF Spaces).

---

## What you do *not* need to do

- **Do not move to Postgres for the fallback.** The SQLAlchemy models are the
  same; `ALLOW_SQLITE=1` is a supported path and is what the hosted Modal demo
  already uses.
- **Do not rebuild the frontend.** It is a standard Next.js app; `output:
  "standalone"` only matters for the Modal `web_server` deployment. Vercel
  builds it normally.
- **Do not delete the Modal deployment** until the new URL has been verified
  end to end (`/status`, a login, one solve, one Muse call).

## Cost reference (Modal, measured)

| Component | Rate | Cost/hour |
|---|---|---:|
| Backend 2 core / 4 GiB | $0.0473/core/h + $0.008/GiB/h | $0.127 |
| UI 1 core / 1 GiB | same | $0.055 |

A two-minute judge session with both warm ≈ $0.006. Always-warm ≈ $4.40/day.
`keepwarm.yml` is manual-only for this reason.
