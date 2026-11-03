# Security and data handling

Written for a reviewer who has five minutes and wants to know what this system
does with data, what protects the public demo, and what is deliberately not
production-grade.

## What data the system handles

| Data | Where it lives | Notes |
|---|---|---|
| Institution model (buildings, rooms, faculty, courses, degree maps) | Postgres (Docker) or SQLite (hosted demo) | Synthetic seed; importable from real files |
| Student records pasted into advising | Request body only, plus the derived plan | Never written to disk beyond the scenario store |
| Faculty intake requests + evidence metadata | Postgres | File name + SHA-256 are stored; **the document itself is never stored** |
| Model calls | Sent to the configured endpoint (Meta Model API, or Baseten for the open-weight path) | No other third party is called |
| Audit ledger | Postgres / SQLite | Append-only by design |

The public demo ships a **synthetic institution**. It is not loaded with real
student data, and the README asks judges not to upload real institutional
records.

## Public demo protections

The hosted demo is keyless, so the model-calling surface is bounded in
`backend/app/services/guard.py`:

- **Durable daily budget** (`DEMO_DAILY_MODEL_BUDGET`) in the `model_usage`
  table — survives restarts.
- **Per-identity rate limits** (40/hour, 6/minute) keyed by bearer-token hash or
  forwarded IP.
- **Request caps**: files per ingest, bytes per ingest, upload bytes, message
  characters, and a hard request-body ceiling — all rejected **before** any
  paid call.
- **Graceful degradation**: budget exhaustion returns `429` and the
  deterministic fallback still answers, so a judge is never blocked by a
  quota.

## Secrets

- Keys are read from the environment only (`MODEL_API_KEY`, `MUSE_ASR_API_KEY`).
- `.env` is gitignored; `.env.example` contains placeholders only.
- No key appears in tracked files or in git history (checked with a full
  `git log -p` scan).
- Modal deployments read keys from Modal secrets, not from the image.

## Authentication

PBKDF2 password hashes and hashed bearer sessions with a 7-day expiry. This is
**demo-grade**: no SSO/SAML, no MFA, no session revocation UI, and demo accounts
share a published password so judges can sign in. It is sized for a single
coordinator office, not an institution — see
[limitations.md](./limitations.md).

## Transport

The hosted demo is served over HTTPS by Modal. The Docker path is plain HTTP
and is meant for local use or behind your own TLS terminator.

## Not done (and known)

- No external penetration test, no dependency-vulnerability gate in CI.
- No per-tenant isolation: one institution per deployment.
- No encryption at rest beyond what the host provides.
- The audit ledger records submissions and change events, not keystrokes.
- Prompt-injection surface: uploaded files are parsed by the model. The model
  never writes the schedule — it proposes typed operations that are validated
  and then proved by a solver — so a hostile document can at worst produce
  rejected operations, not a wrong timetable.
