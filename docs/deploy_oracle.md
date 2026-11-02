# Deploy on Oracle Cloud Always Free (recommended free host)

Oracle's Always Free tier is the best fit for this stack: **4 ARM cores, 24 GB
RAM, always on**, no monthly credit to burn and no cold starts. Unlike a
serverless free tier, `docker compose up` runs exactly as documented — Postgres
18, the FastAPI backend, and the Next.js UI on one VM.

ARM was the risk; it is verified. Every native dependency publishes an
`aarch64` wheel at the pinned versions:

| Package | Version | aarch64 |
|---|---|---|
| ortools | 9.15.6755 | yes |
| scipy | 1.18.1 | yes |
| numpy | 2.5.4 | yes |
| pymupdf | 2.1 | yes |
| psycopg-binary | 3.3.6 | yes |
| pydantic-core | 2.14.1 | yes |
| fastapi / uvicorn / sqlalchemy / pypdf / openai | pinned | pure-python / yes |

The native C++ solver compiles with the `g++` already installed in
`backend/Dockerfile`. Base images (`python:3.12-slim`, `postgres:18-alpine`,
`node:20-slim`) are all multi-arch.

---

## 1. Create the instance

1. Sign up at <https://cloud.oracle.com/free>. A card is required for identity
   verification; Always Free resources are not charged.
2. **Compute → Instances → Create.**
   - Image: **Ubuntu 24.04** (aarch64)
   - Shape: **VM.Standard.A1.Flex**, **4 OCPUs / 24 GB** (the full Always Free
     allowance)
   - Boot volume: 100 GB
   - Assign a public IPv4 address
3. If you get `Out of host capacity`, try another availability domain or
   another region; A1 capacity is the one thing that actually blocks this.

## 2. Open the ports

Two firewalls, both must allow traffic:

**Cloud side** — VCN → Security Lists → default → Add Ingress Rules:
`0.0.0.0/0` → TCP `80`, `443` (SSH `22` is already there).

**Instance side** — Oracle's Ubuntu images ship iptables rules that drop
everything but 22:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

## 3. Docker + swap

The Next.js build and OR-Tools install want headroom; 4 GB swap makes the
first build safe on 24 GB:

```bash
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker
```

## 4. Deploy

```bash
git clone https://github.com/prohle/schedulesolve-ai.git
cd schedulesolve-ai
cp .env.example .env
```

Fill `.env` — **this is the part that matters.** Without it the app defaults to
the Meta Model API and spends your remaining Meta credits instead of the
Baseten allowance:

```bash
MODEL_API_KEY=<baseten key, b10_...>
MUSE_BASE_URL=https://inference.baseten.co/v1
MUSE_MODEL=meta-models/muse-spark-open-1026
MUSE_REASONING_EFFORT=low
MUSE_ASR_BASE_URL=https://api.meta.ai/v1
MUSE_ASR_MODEL=muse-voice-transcribe-1.0
MUSE_ASR_API_KEY=<meta model api key>
DEMO_DAILY_MODEL_BUDGET=300
```

`docker-compose.yml` passes all of these through (defaults unchanged), so the
same file works for judges running locally.

```bash
docker compose up -d --build     # first build ~10-15 min on 4 ARM cores
docker compose ps
curl -s localhost:8000/status    # {"status":"ok",...}
curl -sI localhost:3000 | head -1
```

## 5. HTTPS (free, no domain)

`sslip.io` resolves any `a.b.c.d.sslip.io` hostname to that IP, which is enough
for Let's Encrypt. With your public IP `129.146.1.2`:

```bash
sudo apt install -y caddy
sudo tee /etc/caddy/Caddyfile >/dev/null <<'EOF'
129.146.1.2.sslip.io {
    reverse_proxy localhost:3000
}
EOF
sudo systemctl reload caddy
```

Caddy fetches a certificate automatically. Result:
`https://129-146-1-2.sslip.io` (dashes in the hostname, dots in the reverse_proxy
target). If you own a domain, point an `A` record at the IP and use that
instead.

Without Caddy, plain HTTP works too: `FRONTEND_PORT=80 docker compose up -d`.

## 6. Verify before you swap the links

Run the same checks used for the Modal deployment:

```bash
curl -s https://<host>/api/engines | head -c 200        # proxy → backend
TOKEN=$(curl -s -X POST https://<host>/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"coordinator@northgate.edu","password":"demo1234"}' | jq -r .token)
curl -s https://<host>/api/runtime/config -H "Authorization: Bearer $TOKEN" | jq '{provider,model,live}'
```

Expect `provider: Baseten`, `model: meta-models/muse-spark-open-1026`,
`live: true`. Then click through the 7-step judge path in the README once, and
only then update the live-demo URL in `readme.md`, `docs/submission.md` and the
X copy.

## Caveats, honestly

- **ARM only.** The Always Free AMD micro shapes are 1 GB — too small for
  OR-Tools + Postgres + Next. Do not pick them.
- **Idle reclamation.** Oracle may reclaim Always Free compute that sits idle
  for a long period. Judging week traffic is enough; if the instance is
  reclaimed later, rebuild from this runbook.
- **Single VM, single point of failure.** Keep the Modal deployment alive as a
  secondary link until the Oracle URL has survived a full day.
- **No managed backups.** `docker compose down` keeps the `schedulesolve_pgdata`
  volume; `down -v` destroys it.

## Alternatives, ranked

| Host | Free? | Card? | Always on? | Fit |
|---|---|---|---|---|
| **Oracle Always Free** | yes, no expiry | yes (verify only) | **yes** | best — full VM, 24 GB |
| Hugging Face Spaces | yes | no | sleeps ~48 h | good fallback, ephemeral disk, ~30 s wake ([guide](./deploy_free_fallback.md)) |
| Google Cloud Run | free tier | yes | scales to zero | good, but billing account required |
| Vercel | yes | no | yes | UI only — use it in front of any backend |
| Render free | yes | no | spins down 15 min | 512 MB is too small for OR-Tools |
| Modal | metered | no | no | current; ~$0.006 per judge session |
