# Deployment guide

Dhaka Tesla Pool v1 is designed to run on free tiers (Vercel web + Render API + Neon Postgres) or entirely via Docker Compose. **This submission uses Docker Compose as the documented public run path** because Neon / Render / Vercel projects were not provisioned with credentials in this environment. The free-tier recipe below is still the intended cloud shape from [`TECH_STACK.md`](./TECH_STACK.md) and [`DESIGN.md` §13](./DESIGN.md).

---

## Documented deployment: Docker Compose

Works on any machine with Docker (or Podman + `docker-compose` compatibility).

```bash
git clone https://github.com/DJRCX/dhaka-tesla-pool.git
cd dhaka-tesla-pool
cp .env.example .env
# Set JWT_SECRET to ≥32 random characters before exposing the host
docker compose up --build
```

| URL | Service |
|---|---|
| http://localhost:43123 | Web (Next.js standalone) |
| http://localhost:48080/health | API health |
| localhost:54329 | Postgres |

- `migrate` runs SQL migrations + seed, then exits.
- Web image bakes `API_INTERNAL_URL=http://api:4000` at **build** time (Next.js rewrites). Rebuild `web` if that URL changes.
- If `postgres:17-alpine` cannot be pulled, set `POSTGRES_IMAGE=docker.io/pgvector/pgvector:pg16` (or another Postgres 16+ image) in `.env`.

### Reset demo data

```bash
docker compose exec api node dist/db/seed.js --reset
```

### Smoke check

1. Open http://localhost:43123
2. **Continue as Jashim** → Banani → Online
3. In another browser / private window: **Continue as Nusrat** → Banani → Mohakhali → Request
4. Accept on the driver; complete the PRD rush-hour story (see README)

---

## Optional free-tier recipe (when accounts are available)

### 1. Neon (Postgres)

1. Create a free Neon project; copy the pooled `DATABASE_URL`.
2. From a machine with Node 24+:

```bash
export DATABASE_URL='postgres://…'   # Neon
export JWT_SECRET='…'               # ≥32 chars
npm ci
npm run db:migrate
npm run db:seed
```

### 2. Render (API)

1. New **Web Service** from this repo.
2. Dockerfile: `apps/api/Dockerfile` (build context = repo root).
3. Health check path: `/health`.
4. Env: `DATABASE_URL`, `JWT_SECRET`, `WEB_ORIGIN` (Vercel URL), fare knobs from `.env.example`, `NODE_ENV=production`, `API_PORT=4000`.
5. Note the public API URL (e.g. `https://teslapool-api.onrender.com`).

### 3. Vercel (web)

1. Import the repo; set root / project to `apps/web` (or monorepo settings that build `@teslapool/web`).
2. Env: `API_INTERNAL_URL=https://<render-api-host>` (no trailing slash). Rebuild after changes — rewrites are compile-time.
3. Deploy. Sign-in cookies stay first-party on the Vercel domain because the browser only calls `/api/*` on that origin.

### 4. End-to-end on the public URL

Run the Banani rush-hour demo with two browsers. Expect **cold starts** on free Render: the first `/health` or login after idle can take tens of seconds while the instance wakes.

---

## Free-tier limits to expect

| Provider | Typical limit that affects the demo |
|---|---|
| Render free web | Spins down when idle; first request after sleep is slow |
| Neon free | Storage / compute caps; suspend after inactivity on some plans |
| Vercel Hobby | Build minutes and bandwidth caps; fine for this MVP |

If any free host cannot run the API, **fall back to Compose** — the brief allows that.

---

## Public URLs for this submission

| Surface | URL |
|---|---|
| Application | `docker compose up` → http://localhost:43123 |
| API health | http://localhost:48080/health |
| Demo video | Added on `release/v1.0.0` (Phase 15) |

Repository: https://github.com/DJRCX/dhaka-tesla-pool

### CI note

GitHub Actions (`.github/workflows/ci.yml`) runs lint, typecheck, Vitest against Compose `db-test`, and builds the API/web images. Local Podman users may need `POSTGRES_IMAGE` and longer image-build times; behaviour matches Docker Compose once images are present.
