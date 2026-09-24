# Dhaka Tesla Pool

Simulated shared-ride MVP for three-wheeled electric "Teslas" in Dhaka.

## Concurrency (last seat)

Every membership change goes through `claimSeats`, which takes a **row lock** on the pool (`SELECT … FOR UPDATE`) before re-checking capacity and inserting `pool_members`.

`apps/api/test/concurrency.test.ts` proves this under load:

1. **Last seat (50×).** Bullet has 1 seat left. Nusrat and Shirin call `claimSeats` on **two separate `pg` pools** with `Promise.allSettled`. Exactly one fulfills; the other gets `409 POOL_FULL`; `seats_taken = 3`.
2. **Double accept.** Jashim and a test-only driver **Karim** (vehicle **Rocket**) accept Nusrat at once; she ends in exactly one pool.
3. **HTTP last seat (50×).** Same race via `POST /api/v1/pools/:id/members`.
4. **Double submit.** Two parallel `POST /rides` without an idempotency key → one `201`, one `409 ACTIVE_RIDE_EXISTS`.

### Experiment (interview material)

Temporarily remove `FOR UPDATE` from `claimSeats` and re-run test 1: both transactions can read `seats_taken = 2`, both insert, and you either overbook until the `CHECK (seats_taken BETWEEN 0 AND capacity)` fires (mapped to `POOL_FULL`) or see `seats_taken > capacity` if that check is also removed. Put the lock back — the race test goes green again. The lock is the intentional serialisation point; the CHECK is defence in depth.

## Quick start

See `docs/TASKS.md` and `.env.example`. Compose ports: Postgres `54329` / test `54330`, API `48080`.
