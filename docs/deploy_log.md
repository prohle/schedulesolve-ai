# Deployment record

Two Modal apps, deployed separately, from separate directories:

| App | Directory | URL |
|---|---|---|
| API | `backend/` | https://prohle--schedulesolve-ai-api.us-east.modal.run |
| UI | `frontend/` | https://prohle--schedulesolve-ai-ui-web.us-east.modal.run |

Modal does not expose the git commit, so the commit below is recorded here by
hand. **Before redeploying, check whether anything actually changed.**

## Last deployed

| App | Commit | Deployed | Notes |
|---|---|---|---|
| API | `7ec7592` | 2026-11-04 | empty-timetable fix, partial-ingest guard, 183 tests |
| UI | `4fd9a98` | 2026-11-04 | landing numbers aligned, fabricated claims removed, hero honesty line |

Commits after `7ec7592` (`41ff858`, `4fd9a98`) touch only `frontend/src` and
`backend/scripts/check_docs.py`, so the deployed API already matches `HEAD` for
`backend/app`.

## Do I need to redeploy?

```bash
# API — anything listed here means the deployed API is behind
git log 7ec7592..HEAD --oneline -- backend/app backend/native

# UI — anything listed here means the deployed UI is behind
git log 4fd9a98..HEAD --oneline -- frontend/src
```

Empty output = already live, nothing to do.

## Verify what is actually deployed (behavioural markers)

Modal gives no commit hash, so check for a feature that only exists in the
newer code:

```bash
API=https://prohle--schedulesolve-ai-api.us-east.modal.run

curl -s $API/engines | grep -q '"native"' && echo "API: post-AI-attribution fix"

TOK=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"coordinator@northgate.edu","password":"demo1234"}' \
  | python3 -c 'import json,sys;print(json.load(sys.stdin)["token"])')

curl -s -H "Authorization: Bearer $TOK" $API/intelligence/utilization \
  | grep -q none_over_cap && echo "API: load-policy deploy"

curl -s -o /dev/null -w '%{http_code}\n' -X POST $API/ingest \
  -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
  -d '{"text":"%%%"}'   # 422 = clobber guard present
```

For the UI, the only reliable check is a browser: the landing page must show
"Measured, and reproducible" under the headline.

## Deploy

Run from the app's own directory — `modal deploy` resolves paths relative to CWD:

```bash
cd backend  && ../backend/.venv/bin/modal deploy modal_app.py
cd frontend && ../backend/.venv/bin/modal deploy modal_app.py
```

**API first, then UI.** The UI reads fields the API serves; shipping them in the
wrong order leaves a window where the UI misreports.

After deploying, update the table above.

## After any destructive test

`POST /scenario/reset` with a coordinator token, then confirm the demo is on the
story seed (6 instructors / 8 sections).
