# Local chat headstart — Dhaka Tesla Pool
Paste this into a new Cursor chat in your local repo (`/home/djrcx/Work/...`), or ask the agent to read `docs/HANDOFF.
md` first.
**You own git.** Do not ask the agent to create GitHub repos, remotes, or force-push unless you explicitly want that. 
Commit, branch, and push yourself when ready.
---
## What this project is
Internship MVP challenge from **RoBenDevs**: **Dhaka Tesla Pool** — share a seat, split the fare, survive Dhaka traffic.
Three actors: **Passenger** (Nusrat, Rafiq, Shirin), **Driver/Tesla** (Jashim + **Bullet**, 3 seats), **Ride/Pool**. 
Story cast must stay in seed data, tests, README, and demo — no `user1`/`driver1`.
Evaluators score: understand → design → build → commit → test → ship → explain. **Following process beats feature count.
** Broken capacity with a pretty UI scores poorly.
Source brief: the PDF you uploaded (keep it out of the public repo; it is already in `.gitignore` under `pdfs/` and `uploads/`).
---
## Docs already written (read these; don’t reinvent)
| File | Role |
|---|---|
| [`docs/PRD.md`](./PRD.md) | Product requirements, cast, matching, fare, lifecycle, assumptions, acceptance |
| [`docs/DESIGN.md`](./DESIGN.md) | Architecture, ERD, state machines, API, concurrency, scaling bonus |
| [`docs/TECH_STACK.md`](./TECH_STACK.md) | Stack + justification format the brief’s Section 7 requires |
| [`docs/TASKS.md`](./TASKS.md) | Phase-by-phase tasks, branches, commits, “done when” checks |
Implementation has **not** started. Next work is **Phase 1** in `TASKS.md` (`feature/project-setup`).
---
## Locked decisions (don’t reopen unless you have a reason)
- **Monorepo:** npm workspaces — `apps/web`, `apps/api`, `packages/shared`
- **Web:** Next.js 16 App Router + React + TypeScript + Tailwind 4 + shadcn/ui + TanStack Query (3s polling)
- **API:** Node 24 + **Fastify 5** (not Express/Nest) — REST `/api/v1`, Zod validation
- **DB:** **PostgreSQL 17** + Drizzle (SQL migrations committed). Money = **integer paisa**
- **Auth:** Argon2id + JWT in httpOnly cookie `dtp_session`
- **Docker Compose required:** `db` + `migrate` + `api` + `web`; uncommon host ports `54329` / `48080` / `43123`
- **No Redis / Kafka / microservices / K8s / map APIs / real payment gateway** in MVP
- **Git model the brief demands:** long-lived `master`, `pre-release`, `release/v1.0.0`, plus `feature/*`. Conventional 
commits: `feat(pool): …` etc. (Your local repo may still be on `main` — rename when you set up for submission; see 
TASKS T0.1.)
### Fare (hand-checkable)
```
passengerFare = baseFare + distanceCharge − poolDiscount
base = ৳40 · per km = ৳25 · pool discount = 20% of distanceCharge when ≥2 riders
```
| Rider | Trip | Solo | Pooled |
|---|---|---|---|
| Nusrat | Banani → Mohakhali 2.5 km | ৳102.50 | **৳90.00** |
| Rafiq | Banani → Gulshan 1 2.8 km | ৳110.00 | **৳96.00** |
| Shirin | Banani → Gulshan 2 1.6 km | ৳80.00 | ৳72.00 |
### Matching
Same pickup zone + every pair of destinations ≤ **3.0 km** + seats fit. Banani→Mohakhali + Banani→Gulshan 1 match; 
Uttara would not.
### Lifecycle (two linked machines)
- Request: `REQUESTED → MATCHED → DRIVER_ARRIVED → STARTED → COMPLETED` (+ `CANCELLED` before start)
- Pool: `ACCEPTED → DRIVER_ARRIVED → STARTED → COMPLETED` (+ `CANCELLED` before start)
- Driver actions move the **pool**; all members update in the same transaction.
### Concurrency (interview hot topic)
Last seat: `SELECT … FOR UPDATE` on the pool row inside `claimSeats`, plus DB `CHECK (seats_taken <= capacity)`. Two 
concurrent claims → one success, one `409 POOL_FULL`. Tests must use **two real Postgres connections**, not mocks.
### Seed passwords (planned)
All cast: `TeslaPool!2026`. Shirin’s wallet ৳50 on purpose (below her ৳80 solo fare) to demo `INSUFFICIENT_BALANCE` vs 
cash.
---
## What the cloud agent already did / did not do
**Done**
- Analyzed the PRD PDF
- Wrote PRD, DESIGN, TECH_STACK, TASKS under `docs/`
- Added `.gitignore` (includes `pdfs/` and `uploads/`)
- Started a public GitHub repo `DJRCX/dhaka-tesla-pool` and pushed only `README.md` + `.gitignore` — then you said 
**you’ll handle git yourself**. Treat that remote as optional; reconcile or ignore as you prefer.
**Not done**
- No app code, Docker, migrations, or deployment
- No full docs push to GitHub (you stopped that)
- No 6-minute video, no AI Usage section (you must write those)
---
## How to work in the local chat
1. Open the local repo root in Cursor.
2. First message: *“Read `docs/HANDOFF.md`, then start Phase 1 in `docs/TASKS.md`.”* (or whichever phase you’re on)
3. Build **one `feature/*` branch at a time**; merge to `master` only when that phase’s “done when” checks pass.
4. Prefer integrity over polish: capacity, state machine, ownership, and concurrency tests before UI chrome.
5. Keep assumptions documented in the PRD when something is underspecified.
### Critical path (don’t skip)
`project-setup` → `database-schema` → `api-foundation` → `domain-rules` + `passenger-auth` → `ride-requests` → 
**`tesla-pooling` (claimSeats + race tests)** → `driver-flow` → wallet → web UI → full Compose → `pre-release` → 
`release/v1.0.0` + video.
---
## Brief gotchas worth remembering
- Branch name must be **`master`** for submission (not only `main`).
- Section 18 of the PDF wrongly says concurrency is in “Section 14”; it is in **Section 12**.
- AI is allowed; README needs an **AI Usage** section (tools, one kept suggestion, one rejected).
- Free hosting only; if free tier fails, document Compose as the deploy.
- You still need a **≤6 min Loom** with the structure in the brief (problem / engineering / product tour + one edge 
case).
---
## Suggested first local prompt
```
Read docs/HANDOFF.md, docs/PRD.md, docs/DESIGN.md, docs/TECH_STACK.md, and docs/TASKS.md.
Do not touch git remotes or GitHub unless I ask.
Start Phase 1 (feature/project-setup) from docs/TASKS.md and stop when that phase is merge-ready.
```
