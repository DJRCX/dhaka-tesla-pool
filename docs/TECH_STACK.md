# Dhaka Tesla Pool — Tech Stack and Justification

| | |
|---|---|
| Scope | v1.0.0 MVP |
| Companion docs | [`PRD.md`](./PRD.md) · [`DESIGN.md`](./DESIGN.md) · [`TASKS.md`](./TASKS.md) |

The brief (Section 7) requires every non-mandated choice to state **what was picked, the realistic alternatives, why it fits a ride-pooling MVP specifically, and what would make us switch later**. This document is written in that format so it can be pasted into the README.

Versions are the current stable majors on npm at planning time (September 2026). Pin exact versions in the lockfile at scaffold time.

## 1. At a glance

| Layer | Choice | Mandated? |
|---|---|---|
| Frontend framework | Next.js 16 (App Router) + React 19 + TypeScript | Yes: React or Next.js |
| Styling / components | Tailwind CSS 4 + shadcn/ui | No |
| Server state (frontend) | TanStack Query 5 | No |
| Backend runtime | Node.js 24 LTS | Yes: Node.js |
| Backend framework | Fastify 5 | Yes: a Node framework, justified |
| API style | REST + JSON under `/api/v1` | Justified |
| Validation / contracts | Zod 4, shared package, `fastify-type-provider-zod` | No |
| Database | PostgreSQL 17 | No (relational recommended) |
| ORM / migrations | Drizzle ORM + drizzle-kit (SQL migrations committed) | No |
| Auth | Argon2id + signed JWT in an httpOnly cookie (`@fastify/jwt`, `@fastify/cookie`) | No |
| Logging | pino (built into Fastify) | No |
| Tests | Vitest 5 + real Postgres; Playwright for one smoke test | No |
| Package manager / repo | npm workspaces (`apps/web`, `apps/api`, `packages/shared`) | No |
| Containers | Docker + Docker Compose | Yes |
| Hosting | Vercel Hobby (web) + Render free (API) + Neon free (DB) | Free tier mandated |
| Lint / format | ESLint + Prettier | No |

## 2. Mandated choices, and how they are used

### Next.js 16 (App Router)
The brief recommends it. It is used for routing, layouts, a thin server-side session check (`proxy.ts`), and a same-origin **rewrite of `/api/*` to the Fastify API**. Pages are mostly client components, because ride screens are live, polled views. SSR adds little there.

### Node.js 24 LTS
The current long-term-support line, used in Docker images for both apps. It ships native `fetch`, a stable test-friendly runtime, and support through the brief's evaluation window.

## 3. Choices that need justification

### 3.1 Backend framework: Fastify 5

| | |
|---|---|
| **Picked** | Fastify |
| **Alternatives** | Express 5, NestJS, Hono |
| **Why it fits this MVP** | Schema-first routes: each route declares its Zod body, query, and response, so invalid input never reaches pooling logic. `app.inject()` runs HTTP-level tests without opening a port, which makes the concurrency and authorisation tests fast. pino logging with request IDs is built in. The whole setup stays small enough to explain line by line in an interview |
| **Why not Express** | Validation, typed routes, logging, and async error handling all need to be assembled by hand. That is fine, but it is more glue code to defend with less structure |
| **Why not NestJS** | Decorators, modules, and dependency injection are powerful for large teams. For about 20 endpoints they add ceremony that the evaluator has to read through to find the pooling rules |
| **Why not Hono** | Excellent for edge runtimes. This API needs long-lived Postgres connections and transactions, where Hono has no advantage |
| **Would switch when** | The domain grows into many bounded contexts with multiple teams (NestJS modules), or the API moves to edge functions (Hono) |

### 3.2 API style: REST

| | |
|---|---|
| **Picked** | REST + JSON, action sub-resources for transitions (`POST /pools/:id/start`) |
| **Alternatives** | GraphQL, tRPC |
| **Why it fits** | The domain is a few resources with explicit, permissioned state changes. HTTP status codes carry meaning (409 = state conflict, e.g. `POOL_FULL`). Easy to curl in the demo, easy to rate limit per route |
| **Why not GraphQL** | Its strength is flexible reads for many client shapes. Here there are two screens per role; the cost is resolver-level authorisation and harder per-operation rate limits |
| **Why not tRPC** | Tight coupling to the TypeScript frontend and an RPC shape that hides HTTP semantics the evaluator will look for |
| **Would switch when** | Several clients (mobile, partner, admin) need very different views of the same data (GraphQL) |

### 3.3 Database: PostgreSQL 17

| | |
|---|---|
| **Picked** | PostgreSQL |
| **Alternatives** | MySQL 8, SQLite, MongoDB |
| **Why it fits** | Pooling is a consistency problem. Postgres gives `SELECT … FOR UPDATE` row locks, CHECK constraints (`seats_taken <= capacity`), **partial unique indexes** (one active ride per passenger, one active pool per vehicle), generated columns (fare total from breakdown), and native enums. Those turn the brief's hardest rules into database guarantees. Free hosted Postgres is widely available |
| **Why not MySQL** | Workable, but it lacks partial unique indexes. The "one active X" rules would need triggers or generated-column tricks |
| **Why not SQLite** | Single-writer locking hides concurrency bugs instead of exposing them, and it does not match the hosted deployment |
| **Why not MongoDB** | Seats, pools, members, and payments are relational with cross-document invariants; the integrity guarantees would move into application code |
| **Would switch when** | Never for the core ledger. At large scale, add PostGIS or H3 for geo, read replicas, and sharding by city |

### 3.4 ORM and migrations: Drizzle

| | |
|---|---|
| **Picked** | Drizzle ORM + drizzle-kit, with generated SQL migrations committed to git |
| **Alternatives** | Prisma, Kysely, raw `pg` with hand-written SQL |
| **Why it fits** | Queries read like SQL, so the locking path (`.for('update')`) is visible and reviewable. The schema file expresses checks, partial indexes, and enums in TypeScript, and the migrations are plain SQL the evaluator can read. No separate engine binary, so Docker images stay small |
| **Why not Prisma** | Very good DX, but row locks and partial indexes need raw SQL escape hatches. The critical path would live outside the ORM anyway |
| **Why not Kysely** | Excellent type-safe query builder; it has no schema-definition or migration generator, so more is hand-written |
| **Why not raw `pg`** | Maximum control, but no type safety between schema and queries |
| **Would switch when** | The team strongly prefers Prisma's tooling, or queries get complex enough that hand-written SQL files are clearer |

### 3.5 Validation and contracts: Zod 4 in a shared package

| | |
|---|---|
| **Picked** | Zod schemas in `packages/shared`, used by Fastify for validation and by the web app for forms and response typing |
| **Alternatives** | TypeBox (Fastify-native JSON Schema), Valibot, class-validator |
| **Why it fits** | One definition of "a valid ride request" (seats 1–6, pickup ≠ dropoff) serves both the form and the server. The server is still authoritative |
| **Why not TypeBox** | Faster, Fastify-native, but less pleasant to reuse in React forms |
| **Would switch when** | Validation shows up as a hot spot in profiling (TypeBox compiles to faster validators) |

### 3.6 Authentication: Argon2id + JWT in an httpOnly cookie

| | |
|---|---|
| **Picked** | Email + password, Argon2id hashing, 7-day signed JWT in `dtp_session` cookie (`HttpOnly`, `SameSite=Lax`, `Secure` in production) |
| **Alternatives** | Auth.js (NextAuth), Clerk / Auth0, server-side sessions table, JWT in localStorage |
| **Why it fits** | Two roles and seeded demo accounts. The evaluator must be able to sign in as Nusrat with no external service. The auth path is short enough to explain fully, and the httpOnly cookie keeps the token away from JavaScript |
| **Why not Auth.js** | It lives in Next.js. The authoritative auth must live in the Node API that enforces pool rules |
| **Why not Clerk/Auth0** | External dependency and account setup for a demo; harder to seed the cast; less to explain about how auth works |
| **Why not localStorage** | Readable by any injected script |
| **Trade-off accepted** | A stateless JWT cannot be revoked before expiry |
| **Would switch when** | Revocation, device management, or OTP login (common in Bangladesh) are needed: move to a sessions table plus phone OTP, or a managed provider |

### 3.7 Real-time updates: polling

| | |
|---|---|
| **Picked** | TanStack Query `refetchInterval: 3000` on active screens, stopped on terminal states |
| **Alternatives** | Server-Sent Events, WebSockets (Socket.IO) |
| **Why it fits** | Status changes a handful of times per ride. Polling needs no extra infrastructure, survives free-tier hosts that drop idle connections, and cannot silently miss a message |
| **Would switch when** | Load makes polling wasteful (see [`DESIGN.md` §14](./DESIGN.md#14-bonus-if-oi-tesla-goes-viral)), or the product needs live driver location |

### 3.8 Styling and components: Tailwind CSS 4 + shadcn/ui

| | |
|---|---|
| **Picked** | Tailwind with shadcn/ui primitives (Button, Card, Select, Switch, Dialog, Badge, Skeleton, Sonner) |
| **Alternatives** | MUI, Chakra UI, plain CSS modules |
| **Why it fits** | Accessible primitives copied into the repo (no runtime dependency to fight), fast to build clean mobile-first screens, and easy to theme. The brief values a simple, clean interface over polish |
| **Would switch when** | A design system with a dedicated designer requires a specific library |

### 3.9 Frontend server state: TanStack Query 5

| | |
|---|---|
| **Picked** | TanStack Query for fetching, caching, polling, and mutation invalidation |
| **Alternatives** | SWR, plain `fetch` + `useEffect`, Redux Toolkit Query |
| **Why it fits** | Polling, retry, loading/error states, and "refetch after 409" come built in. That is exactly what ride screens need |
| **Would switch when** | Moving to server components with streaming for most data (fewer client queries) |

### 3.10 Testing: Vitest + real Postgres, Playwright smoke

| | |
|---|---|
| **Picked** | Vitest for unit and integration tests; a `db-test` Compose service; Fastify `inject()`; one Playwright happy-path test |
| **Alternatives** | Jest, Testcontainers, mocked repositories |
| **Why it fits** | The brief's required tests (capacity, transitions, concurrency, ownership) are properties of the **database + service** together. A real Postgres is the only honest way to test row locks and constraints |
| **Why not mocks** | A mocked repository would pass while production overbooks |
| **Why not Testcontainers** | Great, but needs Docker socket access from the test runner. A Compose service is simpler to run in CI and to explain |
| **Would switch when** | Parallel CI runs need isolated databases per worker (Testcontainers) |

### 3.11 Monorepo: npm workspaces

| | |
|---|---|
| **Picked** | npm workspaces with `apps/web`, `apps/api`, `packages/shared` |
| **Alternatives** | Two separate repos, pnpm workspaces, Turborepo/Nx |
| **Why it fits** | One repo for the evaluator, one lockfile, shared contracts without publishing packages. npm ships with Node, so a fresh clone needs fewer tools than pnpm/Corepack |
| **Why not pnpm** | Equally fine for this MVP; npm is the path of least friction for evaluators who only have Node installed |
| **Why not Turborepo/Nx** | Build caching across two apps is not a real problem yet |
| **Would switch when** | Build times or package count grow enough that task caching pays off, or the team standardises on pnpm |

### 3.12 Hosting: free tiers only

| Piece | Picked | Alternatives | Notes |
|---|---|---|---|
| Web | Vercel Hobby | Netlify, Render static site | First-class Next.js support; `/api/*` rewrite points at the API URL |
| API | Render free web service (from `apps/api/Dockerfile`) | Koyeb free, Fly.io | Sleeps when idle: first request after sleep is slow |
| Database | Neon free Postgres | Supabase free Postgres | Serverless Postgres, branching for previews; compute scales to zero |
| Fallback | `docker compose up` on any Docker host | — | Documented if a free tier cannot host the API |

**Would switch when:** there is real traffic or an uptime requirement. Then move to a paid always-on instance close to Bangladesh (for example, Singapore or Mumbai regions) with a managed Postgres in the same region.

Free-tier terms change often. Re-check each provider's limits (sleep behaviour, hours, storage) before deploying and record the date checked in the README.

## 4. Explicitly not used (and why)

The brief warns against adding technology to make the diagram look impressive.

| Technology | Why not in v1 | When it would be justified |
|---|---|---|
| Redis | No cache or pub/sub need; row locks handle consistency | Live driver locations (GEO), shared rate limits across many API instances |
| Kafka / queues | One process can match synchronously in milliseconds | Matching becomes a hot path per zone (see DESIGN §14) |
| Microservices | One team, one domain, one database | Independent scaling or ownership of payments/matching |
| Kubernetes | Compose covers local and single-host deployment | Many services with independent scaling needs |
| Map APIs | The brief says to keep geography simple | Real pickup points and routing |
| Payment gateway | Brief allows simulated wallet | Real money (bKash / Nagad / card integration) |

## 5. Environment variables (`.env.example`)

| Variable | Used by | Example | Notes |
|---|---|---|---|
| `POSTGRES_USER` | db | `teslapool` | |
| `POSTGRES_PASSWORD` | db | `change-me-locally` | Local only |
| `POSTGRES_DB` | db | `teslapool` | |
| `DATABASE_URL` | api, migrate | `postgres://teslapool:change-me-locally@db:5432/teslapool` | Use `localhost:54329` outside Docker |
| `TEST_DATABASE_URL` | api tests | `postgres://teslapool:change-me-locally@localhost:54330/teslapool_test` | `db-test` service |
| `JWT_SECRET` | api | `replace-with-32+-random-characters` | Startup fails if shorter than 32 |
| `API_PORT` | api | `4000` | Container port |
| `WEB_ORIGIN` | api | `http://localhost:43123` | Cookie and security headers |
| `API_INTERNAL_URL` | web | `http://api:4000` | Target of the `/api/*` rewrite |
| `FARE_BASE_PAISA` | api | `4000` | Tariff; defaults match the PRD |
| `FARE_PER_KM_PAISA` | api | `2500` | Must be divisible by 10 |
| `FARE_POOL_DISCOUNT_PERCENT` | api | `20` | 0–50 |
| `POOL_DETOUR_LIMIT_M` | api | `3000` | Matching rule |
| `LOG_LEVEL` | api | `info` | |
