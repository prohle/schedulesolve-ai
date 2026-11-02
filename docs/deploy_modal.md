# Live demo on Modal

Deployed and live:
- **UI:** https://prohle--schedulesolve-ai-ui-web.us-east.modal.run (`modal deploy frontend/modal_app.py` — Next.js standalone Node server, scale-to-zero)
- **Backend API:** https://prohle--schedulesolve-ai-api.us-east.modal.run (FastAPI, scale-to-zero)

The backend is a standard FastAPI app; Modal runs it as a scale-to-zero ASGI
container. The Next.js UI proxies through its existing `/api/*` routes
(server-side `BACKEND_URL`), so no CORS changes are needed. Vercel remains an
alternative UI host with the same `BACKEND_URL` setting.

## 1. Deploy the backend

```bash
pip install modal
modal setup                       # once
modal secret create meta-api MODEL_API_KEY=...   # your Meta Model API key

cd backend
modal deploy modal_app.py
```

Modal prints a URL like `https://<workspace>--schedulesolve-ai-api.modal.run`.
Open `/status` and `/docs` to verify it.

**State:** SQLite is mounted on the `schedulesolve-data` Modal Volume, so the
audit trail survives restarts. `POST /scenario/reset` returns the demo to the
seed term.

**Cost:** `min_containers=0` scales to zero. Warm it for the judging window
with a request (or temporarily set `min_containers=1` and redeploy). An
always-warm 2 CPU / 4 GB container for two weeks can consume most of the $100
credit; scale-to-zero is the default for a reason.

**Safety:** the endpoint is public. Set a Meta API spend limit and a Modal
spend limit. If you want a hard gate, put the Modal URL behind a Vercel
rewrite and add a shared `X-Demo-Token` check; the Next proxy is the only
caller that needs it.

## 2. Deploy the UI

Deployed option (live above): `modal deploy frontend/modal_app.py` builds
the Next.js standalone server (`output: "standalone"` in `next.config.ts`,
assets copied per the Next.js standalone guide) and serves it with
`BACKEND_URL` pointing at the backend Modal URL.

Alternative (Vercel):
- Import the repo into Vercel.
- Root directory: `frontend`.
- Environment variable: `BACKEND_URL=https://<workspace>--schedulesolve-ai-api.modal.run`.
- Deploy.

The UI's `/api/*` routes forward to `BACKEND_URL`; the browser never talks to
Modal directly.

## 3. Demo-day checklist

Verified live **Oct 30** against the deployed Modal stack (UI redeployed
with the Guided build/Insights interface the same day):

- [x] `GET /status` returns `ok`.
- [x] `POST /scenario/reset` returns the seed (left reset for judges).
- [x] `POST /copilot` with the Patel sentence returns `muse-spark`.
- [x] `POST /term-change` with the Chen sentence returns verified proposals.
- [x] `POST /term-change/audio` accepts a 24 kHz mono WAV and returns a transcript.
- [x] The Modal UI loads Express and the Full → Audit trail.
- [ ] Meta + Modal spend limits are set — account action.
