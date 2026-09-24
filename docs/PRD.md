# Dhaka Tesla Pool — Product Requirements Document

> Share a seat. Split the fare. Survive Dhaka traffic.

| | |
|---|---|
| Version | v1.0.0 (MVP) |
| Source brief | RoBenDevs internship challenge, "Dhaka Tesla Pool" (5 pages) |
| Companion docs | [`DESIGN.md`](./DESIGN.md) · [`TECH_STACK.md`](./TECH_STACK.md) · [`TASKS.md`](./TASKS.md) |

---

## 1. Summary

Dhaka Tesla Pool is a shared-ride MVP for three-wheeled electric "Teslas" in Dhaka. A passenger requests a ride between two known Dhaka areas. If another passenger is heading in a compatible direction from the same pickup area and the vehicle has free seats, both share the vehicle and each pays their own discounted fare. The driver sees who is on board and moves the trip through a clear lifecycle. After the ride, the system keeps an audit trail that can explain exactly what happened.

The brief is an engineering assessment. It rewards **correct data integrity, a clean process, and the ability to explain every decision** more than it rewards feature count. This PRD scopes the MVP accordingly.

## 2. The story (canonical cast)

The cast is used in seed data, tests, the README, and the demo video. Generic placeholders (`user1`, `driver1`) are out of scope by design.

| Person | Role | Canonical trip | Why they exist in the story |
|---|---|---|---|
| **Jashim** | Driver | Waiting at Banani Road 11 | Wants to know who is riding and when he can go |
| **Bullet** | Jashim's vehicle | 3 seats, battery powered | The fixed capacity that must never be exceeded |
| **Nusrat** | Passenger | Banani → Mohakhali, 1 seat | First request; the pool starts with her |
| **Rafiq** | Passenger | Banani → Gulshan 1, 1 seat | Overlapping-but-not-identical route: the pooling case |
| **Shirin** | Passenger | Banani → Gulshan 2, 1 seat | Arrives for the last seat: the capacity and concurrency case |

**Rush-hour timeline (demo script):**

1. 8:41 AM: Jashim is online in Banani. Nusrat requests Banani → Mohakhali (solo estimate ৳102.50).
2. Jashim accepts. A pool is created on Bullet with 1 of 3 seats taken. Nusrat is `MATCHED`.
3. 8:43 AM: Rafiq requests Banani → Gulshan 1. The system finds Jashim's pool compatible and seats him automatically (2 of 3). Both now see their own pooled fare.
4. 8:43:30 AM: Shirin requests Banani → Gulshan 2 and takes the last seat (3 of 3). Anyone after her waits for another vehicle.
5. Jashim marks *arrived*, then *started*. Membership and fares freeze.
6. Jashim marks *completed*. Each passenger is charged their own fare, and history shows every step.

## 3. Problem statement

Solo rides in Dhaka are expensive for passengers and inefficient for small electric vehicles. Riders leaving the same neighbourhood at the same time often head the same way. The product needs to:

- decide quickly and consistently whether two requests can share a vehicle;
- never seat more people than the vehicle holds, even when two people tap "request" at the same moment;
- charge each rider a fair, individually explainable price;
- show the driver exactly who is on board and what stage the trip is in;
- show each passenger only their own fare and status, not co-riders' details;
- keep enough history to answer "what happened on this ride?" afterward.

## 4. Goals and non-goals

### Goals (MVP)

| # | Goal | Measured by |
|---|---|---|
| G1 | Passengers can request, track, cancel, and review rides | End-to-end passenger flow in the demo |
| G2 | Drivers can go online, accept, and run a trip to completion | End-to-end driver flow in the demo |
| G3 | Compatible requests share one vehicle automatically | Nusrat + Rafiq + Shirin share Bullet in the demo |
| G4 | Capacity can never be exceeded | Automated tests, including a concurrent last-seat race |
| G5 | Every passenger gets an individual, hand-checkable fare | Fare unit tests match the worked example in §8 |
| G6 | Every state change is recorded and explainable | `ride_events` audit trail per ride |
| G7 | Anyone can run it with `docker compose up` | Fresh-clone run on another machine |

### Non-goals (explicitly out of scope)

- Real routing, turn-by-turn navigation, live GPS, or map APIs.
- Real payment gateways. Payment is cash or a simulated **TeslaPay** wallet.
- Microservices, Kafka, Redis, queues, Kubernetes. These are discussed only in the scaling write-up.
- Surge pricing, ratings, chat, push notifications, and driver payouts.
- Native mobile apps. The web UI is responsive instead.
- Paid infrastructure of any kind.

## 5. Users and personas

### Passenger (Nusrat, Rafiq, Shirin)
Needs to get somewhere at a fair price with minimal friction. Cares about: the estimated fare before committing, clear status ("is my driver here yet?"), the ability to cancel before the trip starts, and privacy from co-riders.

### Driver (Jashim with Bullet)
Needs to fill seats and get moving. Cares about: seeing relevant requests near him, knowing exactly who and how many are on board, simple big-button actions (arrived, start, complete), and a record of what he earned.

### Evaluator (implicit third user)
Needs to clone, run, test, and understand the system without asking the author. Cares about: a working `docker compose up`, demo credentials, a hand-checkable fare, and a README that explains the decisions.

## 6. Functional requirements

Priority: **P0** = required for v1.0.0, **P1** = include if time allows and integrity is already solid, **P2** = documented as a next improvement only.

### 6.1 Accounts and authentication

| ID | Requirement | Priority |
|---|---|---|
| AUTH-1 | A user can sign up as a passenger with name, email, phone, and password | P0 |
| AUTH-2 | A user can sign in and sign out; the session survives a page refresh | P0 |
| AUTH-3 | Each user has exactly one role: `PASSENGER` or `DRIVER` | P0 |
| AUTH-4 | Driver accounts are created by seed data. There is no public driver sign-up in v1 (see assumption A7) | P0 |
| AUTH-5 | Passenger-only and driver-only pages and endpoints reject the other role (403) | P0 |
| AUTH-6 | Seeded demo accounts for the whole cast are listed in the README and on the sign-in page | P0 |

### 6.2 Passenger

| ID | Requirement | Priority |
|---|---|---|
| PAS-1 | Choose pickup area, destination area (different from pickup), seat count (1–3), payment method (Cash / TeslaPay), and whether pooling is allowed | P0 |
| PAS-2 | See the fare estimate before confirming: solo fare and pooled fare | P0 |
| PAS-3 | Submit the request. If a compatible pool with free seats exists, join it immediately; otherwise wait for a driver | P0 |
| PAS-4 | Track status: `REQUESTED → MATCHED → DRIVER_ARRIVED → STARTED → COMPLETED`, or `CANCELLED` | P0 |
| PAS-5 | See driver name, vehicle name (Bullet), and how many co-riders are sharing. Co-rider names, destinations, and fares are not shown | P0 |
| PAS-6 | See their own current fare breakdown (base + distance − pool discount) | P0 |
| PAS-7 | Cancel while status is `REQUESTED`, `MATCHED`, or `DRIVER_ARRIVED`. Cancel is rejected once `STARTED` | P0 |
| PAS-8 | Only one active request at a time per passenger | P0 |
| PAS-9 | View ride history with final fare, payment method, and status timeline | P0 |
| PAS-10 | See TeslaPay wallet balance and transactions | P1 |
| PAS-11 | Rate a completed ride | P2 |

### 6.3 Driver

| ID | Requirement | Priority |
|---|---|---|
| DRV-1 | Go online in a chosen current area, or go offline | P0 |
| DRV-2 | Cannot go offline while running an active pool | P0 |
| DRV-3 | Owns exactly one vehicle with fixed capacity (Bullet, 3 seats) | P0 |
| DRV-4 | While online and idle, see waiting requests whose pickup is in the driver's current area | P0 |
| DRV-5 | Accept a request, which creates a pool on their vehicle | P0 |
| DRV-6 | While the pool has not started, see compatible waiting requests and add them if seats allow | P0 |
| DRV-7 | See each member: name, pickup, destination, seats, fare, payment method | P0 |
| DRV-8 | Mark `DRIVER_ARRIVED`, `STARTED`, `COMPLETED` in order only | P0 |
| DRV-9 | Cancel a pool before `STARTED`; its passengers return to the waiting queue instead of being cancelled | P0 |
| DRV-10 | View ride history and total fares collected per ride | P0 |

### 6.4 Pooling and ride split

| ID | Requirement | Priority |
|---|---|---|
| POOL-1 | Multiple requests may share one vehicle | P0 |
| POOL-2 | Occupied seats never exceed vehicle capacity, under any concurrency | P0 |
| POOL-3 | A request joins a pool only if it satisfies the matching rule (§7) | P0 |
| POOL-4 | Pools accept new members only while `ACCEPTED` or `DRIVER_ARRIVED` and not full | P0 |
| POOL-5 | A passenger who disallows pooling gets an exclusive pool that nobody else can join | P0 |
| POOL-6 | Each passenger gets an individual fare. Pool discount recalculates when members join or leave before start | P0 |
| POOL-7 | Membership and fares are frozen when the pool starts | P0 |
| POOL-8 | If the last member cancels before start, the pool is cancelled automatically and the driver is free again | P0 |

### 6.5 Payment (simulated)

| ID | Requirement | Priority |
|---|---|---|
| PAY-1 | Payment method is chosen per request: `CASH` or `WALLET` (TeslaPay) | P0 |
| PAY-2 | A wallet request is accepted only if the balance covers the **solo** estimate, the most the ride can cost | P0 |
| PAY-3 | On completion, wallet riders are debited the final fare in the same transaction as the completion | P0 |
| PAY-4 | Cash rides record the amount the driver should collect | P0 |
| PAY-5 | A ride is never charged twice | P0 |

### 6.6 History and audit

| ID | Requirement | Priority |
|---|---|---|
| HIST-1 | Every status change writes an event: who, what, from, to, when | P0 |
| HIST-2 | Pool joins, leaves, fare recalculations, and payments are recorded as events | P0 |
| HIST-3 | Passenger and driver history pages render the timeline from events | P0 |

## 7. Matching rule

This rule is intentionally simple, deterministic, and applied in one place on the server.

A waiting request **R** is compatible with pool **P** when all of the following hold:

1. `P.status` is `ACCEPTED` or `DRIVER_ARRIVED`. Pools that have started take no new riders.
2. `P.is_shared` is true, and `R.allow_pool` is true.
3. `R.pickup_zone == P.pickup_zone`. Everyone boards in the same area.
4. For every active member **M** of P: `distance(R.dropoff, M.dropoff) ≤ 3.0 km` (the "detour limit"). Destinations stay close to each other.
5. `P.seats_taken + R.seats ≤ P.capacity`.

If several pools qualify, the one created first wins (FIFO). When no pool qualifies, R stays `REQUESTED` until a driver accepts it or it is cancelled.

**Applied to the story.** Distances come from the seeded zone table in [`DESIGN.md` §5](./DESIGN.md#5-geography).

| Check | Nusrat (→ Mohakhali) + Rafiq (→ Gulshan 1) | + Shirin (→ Gulshan 2) | If Shirin went to Uttara instead |
|---|---|---|---|
| Same pickup (Banani) | yes | yes | yes |
| Destination spread ≤ 3.0 km | Mohakhali–Gulshan 1 = 1.6 km | Gulshan 2–Mohakhali = 2.9, Gulshan 2–Gulshan 1 = 2.2 | Uttara–Mohakhali = 15.7 km → **no** |
| Seats | 1 + 1 ≤ 3 | 2 + 1 ≤ 3 | — |
| Result | pooled | pooled, Bullet full | waits for another vehicle |

## 8. Fare model

```
passengerFare = baseFare + distanceCharge − poolDiscount

baseFare       = ৳40.00                       (4,000 paisa)
distanceCharge = ৳25.00 per km of the passenger's own trip   (2,500 paisa/km)
poolDiscount   = 20% of distanceCharge when the pool has ≥ 2 passengers at that moment, else 0
```

- Money is stored and computed as **integer paisa** (৳1 = 100 paisa). No floats anywhere.
- Distance is the passenger's own pickup → dropoff distance, not the pool's route. Each rider pays for their own trip.
- Distances are stored in multiples of 100 m, so `distanceCharge` is always a multiple of 250 paisa and 20% of it is always a whole number of paisa. There is no rounding step.
- The fare shown on request is an **estimate**. It is recomputed whenever pool membership changes and **frozen at `STARTED`**.
- Seat count does not change the fare in v1 (assumption A5).

### Worked example (evaluator hand check)

| | Nusrat | Rafiq | Shirin |
|---|---|---|---|
| Trip | Banani → Mohakhali | Banani → Gulshan 1 | Banani → Gulshan 2 |
| Distance | 2.5 km | 2.8 km | 1.6 km |
| Base fare | 4,000 | 4,000 | 4,000 |
| Distance charge | 2.5 × 2,500 = 6,250 | 2.8 × 2,500 = 7,000 | 1.6 × 2,500 = 4,000 |
| **Solo fare** | **10,250 (৳102.50)** | **11,000 (৳110.00)** | **8,000 (৳80.00)** |
| Pool discount (20%) | 1,250 | 1,400 | 800 |
| **Pooled fare** | **9,000 (৳90.00)** | **9,600 (৳96.00)** | **7,200 (৳72.00)** |

The Nusrat + Rafiq pool collects ৳186.00 instead of ৳212.50 for two solo rides. With Shirin aboard, Jashim collects ৳258.00 for one trip.

## 9. Ride lifecycle

The brief suggests `REQUESTED → MATCHED/ACCEPTED → DRIVER_ARRIVED → STARTED → COMPLETED (+ CANCELLED)`. The MVP keeps that sequence and splits it across two related state machines. Full rules are in [`DESIGN.md` §6](./DESIGN.md#6-state-machines).

- A **ride request** is one passenger's journey: `REQUESTED → MATCHED → DRIVER_ARRIVED → STARTED → COMPLETED`, or `CANCELLED`.
- A **pool** is one trip of one vehicle: `ACCEPTED → DRIVER_ARRIVED → STARTED → COMPLETED`, or `CANCELLED`.

**The improvement over the suggested lifecycle, and why.** The driver acts on the pool, not on each passenger one by one. When Jashim taps *Start*, every active member moves to `STARTED` in the same transaction, so a passenger can never be `STARTED` in a pool that is `DRIVER_ARRIVED`. The passenger's status is always explainable from the pool's status.

### Cancellation rules

| Who | When | Effect |
|---|---|---|
| Passenger | `REQUESTED` | Request `CANCELLED` |
| Passenger | `MATCHED` / `DRIVER_ARRIVED` | Request `CANCELLED`, seats released, co-riders' fares recalculated; pool auto-cancels if it becomes empty |
| Passenger | `STARTED` or later | Rejected (`409 INVALID_TRANSITION`) |
| Driver | Pool `ACCEPTED` / `DRIVER_ARRIVED` | Pool `CANCELLED`; its passengers return to `REQUESTED` so another driver can pick them up |
| Driver | Pool `STARTED` or later | Rejected |

No cancellation fee in v1 (see §13).

## 10. Privacy rules

| Viewer | Can see | Cannot see |
|---|---|---|
| Passenger | Own request, own fare breakdown, own status, driver name, vehicle, co-rider **count** | Co-riders' names, destinations, fares, phone numbers |
| Driver | Every member of **their own** pools: name, pickup, destination, seats, fare, payment method | Requests outside their current area; other drivers' pools |
| Anyone | Zones and fare quotes | Any ride they are not part of (404, not 403, so ride IDs cannot be probed) |

## 11. Non-functional requirements

| Area | Requirement |
|---|---|
| Integrity | Capacity, one-active-ride-per-passenger, one-active-pool-per-vehicle, and non-negative wallet balances are enforced by the database, not only by application code |
| Consistency | Every multi-row change (join, cancel, start, complete, pay) is one database transaction |
| Concurrency | Two simultaneous claims for the last seat produce exactly one success and one clear `409 POOL_FULL` |
| Security | Passwords hashed with Argon2id; session in an httpOnly cookie; server-side authorisation on every endpoint; input validation on every body and query; rate limit on auth endpoints; no secrets committed |
| Observability | Structured JSON logs with request IDs; `/health` checks database connectivity |
| Performance | Typical API responses under 200 ms locally; passenger and driver screens refresh status within about 3 seconds |
| Portability | `docker compose up` on a clean machine brings up web, API, and database with migrations and seed data |
| Usability | Works on a 360 px phone screen and on desktop; every screen has loading, empty, and error states |
| Cost | Only free tiers. If free hosting cannot run the stack, Docker Compose is the documented deployment |

## 12. Assumptions

The brief leaves some details open on purpose. Each assumption below is documented, applied consistently, and easy to change.

| # | Assumption | Reason |
|---|---|---|
| A1 | Geography is a fixed list of 10 Dhaka areas with a seeded distance table | The brief says not to fight map APIs; a table is hand-checkable |
| A2 | Everyone in a pool boards in the same area | Keeps matching explainable; multi-stop pickup is a next improvement |
| A3 | Destination spread limit is 3.0 km between every pair of members | Covers the Banani → Gulshan / Mohakhali cluster and rejects far trips like Uttara |
| A4 | Pool discount is a flat 20% of the distance charge once there are ≥ 2 riders | Simple enough to compute by hand; recomputed on every membership change |
| A5 | Fare does not scale with seat count | A group booking 2 seats pays one fare in v1; noted as a next improvement |
| A6 | Rides are "now" only. No scheduled rides | Matches the rush-hour story |
| A7 | Drivers are onboarded by the operator (seeded). There is no driver self-sign-up | Driver onboarding needs vehicle verification in real life; out of MVP scope |
| A8 | A driver sees requests in their current area only | "Relevant requests" without geospatial search |
| A9 | Status updates use short polling (about every 3 seconds) | Enough for an MVP; WebSockets/SSE are a scaling improvement |
| A10 | Waiting requests do not expire automatically in v1 | Documented limitation; expiry job is a next improvement |
| A11 | A passenger can hold only one active request | Prevents double-booking and simplifies wallet holds |
| A12 | The first driver to accept a request wins; the second gets `409` | Same row-locking approach as seat claims |
| A13 | New passengers get a simulated TeslaPay balance of ৳200.00 at sign-up | Lets a fresh account try wallet payment without a top-up flow |

## 13. Known limitations and next improvements

- No request expiry, no scheduled rides, no multi-stop pickup ordering.
- No cancellation fee after `DRIVER_ARRIVED`.
- Polling instead of real-time push.
- Fare does not account for seats, traffic, or weather.
- Driver onboarding is seed-only.
- Single database instance; no read replicas.

## 14. Deliverables (from the brief's submission checklist)

| Deliverable | Where it lives |
|---|---|
| Working MVP: frontend, backend, database | `apps/web`, `apps/api`, Postgres via Compose |
| `docker compose up`, `.env.example`, health checks | repo root |
| Migrations and seed data using the cast | `apps/api/drizzle/`, `apps/api/src/db/seed.ts` |
| Architecture diagram and ERD | [`DESIGN.md`](./DESIGN.md), copied into the README |
| Branches `master`, `pre-release`, `release/v1.0.0`, `feature/*` with meaningful history | Git (see [`TASKS.md` §0](./TASKS.md#0-ground-rules-git-and-process)) |
| Tests for the risky behaviour | `apps/api/test/` |
| README: all sections required by the brief, including AI Usage | `README.md` |
| Viral-scale bonus write-up | [`DESIGN.md` §14](./DESIGN.md#14-bonus-if-oi-tesla-goes-viral) |
| Six-minute video link | README (recorded by the author) |
| Public deployment link, free tier only | README |

## 15. Acceptance criteria for v1.0.0

The release is done when all of these are true:

1. A fresh clone runs with `cp .env.example .env && docker compose up`, and the demo accounts work.
2. The full story in §2 can be performed through the UI with two browser windows.
3. Bullet can never show more than 3 occupied seats, and the concurrent last-seat test passes.
4. Nusrat's and Rafiq's pooled fares are ৳90.00 and ৳96.00, and a unit test proves it.
5. Invalid transitions (for example, *complete* before *start*) are rejected with `409`.
6. Nusrat cannot view or cancel Rafiq's ride.
7. Cancellation rules in §9 hold and are tested.
8. The README covers every section the brief lists, and the git history shows feature branches merged into `master`, then `pre-release`, then `release/v1.0.0`.

## 16. Notes on the brief itself

These do not change the product, but they are worth knowing before the interview:

- Section 18 refers to "the concurrency problem in Section 14". It is actually described in Section 12.
- The brief requires a branch named **`master`**. Many hosts create `main` by default. The submission repo should use `master` as its long-lived integration branch.
- "Tesla" in the story is a three-wheeled electric vehicle, not a car. It is a joke, and the capacity is 3.
- Scoring states that following instructions counts heavily: a small clean MVP beats a large app with a broken process.
