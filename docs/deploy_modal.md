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

**Cost, measured (Modal rates, this stack):** `min_containers=0` scales to
zero and a container idles after ~60 s without traffic.

| Warm component | Rate | Cost/hour |
|---|---|---:|
| Backend (2 core / 4 GiB) | $0.0473/core/h + $0.008/GiB/h | **$0.127** |
| UI (1 core / 1 GiB) | same | **$0.055** |

So a judge's 2-minute session with both warm is ~**$0.006**, and an
always-warm stack is ~$4.40/day. A $30 credit covers the whole judging and
community-vote window with room to spare.

`keepwarm.yml` is still **manual-only**: pinging every 15 minutes does not
keep a scale-to-zero app warm (each ping pays a cold start, then idles), so
480 pings over judging week would buy nothing. A cold start is ~6–20 s with a
cached image, which is the better trade. Run
`gh workflow run keepwarm.yml` manually right before a live demo if you want
the containers hot.

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
