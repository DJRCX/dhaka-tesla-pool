import { eq, sql } from 'drizzle-orm';
import { hash } from '@node-rs/argon2';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createDb, createPool } from '../src/db/client.js';
import {
  driverProfiles,
  poolMembers,
  pools,
  rideRequests,
  users,
  vehicles,
  wallets,
} from '../src/db/schema.js';
import { seed } from '../src/db/seed.js';
import { AppError, ErrorCodes } from '../src/lib/errors.js';
import { tariffFromConfig } from '../src/modules/fares/fare.js';
import { acceptRequest } from '../src/modules/pools/accept.js';
import { claimSeats } from '../src/modules/pools/pool.service.js';
import { ZoneCache } from '../src/modules/zones/cache.js';
import { testDb } from './setup.js';

const BANANI = 1;
const MOHAKHALI = 4;
const GULSHAN_1 = 2;
const GULSHAN_2 = 3;
const ITERATIONS = 50;

async function login(
  app: Awaited<ReturnType<typeof buildApp>>,
  email: string,
) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password: 'TeslaPool!2026' },
  });
  expect(res.statusCode).toBe(200);
  return res.cookies.find((c) => c.name === 'dtp_session')!.value;
}

async function userId(email: string) {
  const [u] = await testDb.select().from(users).where(eq(users.email, email)).limit(1);
  if (!u) throw new Error(`missing ${email}`);
  return u.id;
}

async function resetRideData() {
  await testDb.execute(sql`
    TRUNCATE TABLE
      wallet_transactions,
      ride_events,
      pool_members,
      pools,
      ride_requests
    RESTART IDENTITY CASCADE
  `);
}

async function setOnline(email: string, zoneId: number) {
  const id = await userId(email);
  await testDb
    .update(driverProfiles)
    .set({ isOnline: true, currentZoneId: zoneId })
    .where(eq(driverProfiles.userId, id));
}

describe('pool concurrency', () => {
  const config = loadConfig();
  const url = config.TEST_DATABASE_URL ?? config.DATABASE_URL;
  /** Two independent connection pools — required so claims are not serialised on one client. */
  const pgA = createPool(url);
  const pgB = createPool(url);
  const dbA = createDb(pgA);
  const dbB = createDb(pgB);
  const pgMain = createPool(url);
  const db = createDb(pgMain);
  let app: Awaited<ReturnType<typeof buildApp>>;
  let zoneCache: ZoneCache;

  beforeAll(async () => {
    await seed({ databaseUrl: url, reset: true });
    zoneCache = await ZoneCache.load(db);
    app = await buildApp({ db, config, logger: false });
  });

  beforeEach(async () => {
    await seed({ databaseUrl: url, reset: true });
    zoneCache = await ZoneCache.load(db);
  });

  afterAll(async () => {
    await app.close();
    await pgA.end();
    await pgB.end();
    await pgMain.end();
  });

  async function deps() {
    return {
      zoneCache,
      tariff: tariffFromConfig(config),
      detourLimitM: config.POOL_DETOUR_LIMIT_M,
    };
  }

  async function setupLastSeatRace() {
    await setOnline('jashim@teslapool.test', BANANI);
    const jashimId = await userId('jashim@teslapool.test');
    const rafiqId = await userId('rafiq@teslapool.test');
    const nusratId = await userId('nusrat@teslapool.test');
    const shirinId = await userId('shirin@teslapool.test');

    const [rafiqReq] = await testDb
      .insert(rideRequests)
      .values({
        passengerId: rafiqId,
        pickupZoneId: BANANI,
        dropoffZoneId: GULSHAN_1,
        seats: 2,
        allowPool: true,
        paymentMethod: 'WALLET',
        distanceM: 2_800,
        soloFarePaisa: 11_000,
        status: 'REQUESTED',
      })
      .returning();

    const { poolId } = await acceptRequest(db, jashimId, rafiqReq!.id, await deps());
    // Rafiq holds 2 seats → 1 left on Bullet (capacity 3)
    expect(
      (await testDb.select().from(pools).where(eq(pools.id, poolId)))[0]?.seatsTaken,
    ).toBe(2);

    const [nusratReq] = await testDb
      .insert(rideRequests)
      .values({
        passengerId: nusratId,
        pickupZoneId: BANANI,
        dropoffZoneId: MOHAKHALI,
        seats: 1,
        allowPool: true,
        paymentMethod: 'WALLET',
        distanceM: 2_500,
        soloFarePaisa: 10_250,
        status: 'REQUESTED',
      })
      .returning();
    const [shirinReq] = await testDb
      .insert(rideRequests)
      .values({
        passengerId: shirinId,
        pickupZoneId: BANANI,
        dropoffZoneId: GULSHAN_2,
        seats: 1,
        allowPool: true,
        paymentMethod: 'CASH',
        distanceM: 1_600,
        soloFarePaisa: 8_000,
        status: 'REQUESTED',
      })
      .returning();

    return { poolId, nusratReqId: nusratReq!.id, shirinReqId: shirinReq!.id };
  }

  it(
    'last seat: exactly one of Nusrat/Shirin wins across 50 races',
    async () => {
      for (let i = 0; i < ITERATIONS; i++) {
        await resetRideData();
        zoneCache = await ZoneCache.load(db);
        const { poolId, nusratReqId, shirinReqId } = await setupLastSeatRace();
        const d = await deps();
        const nusratId = await userId('nusrat@teslapool.test');
        const shirinId = await userId('shirin@teslapool.test');

        const results = await Promise.allSettled([
          dbA.transaction((tx) => claimSeats(tx, poolId, nusratReqId, nusratId, d)),
          dbB.transaction((tx) => claimSeats(tx, poolId, shirinReqId, shirinId, d)),
        ]);

        const fulfilled = results.filter((r) => r.status === 'fulfilled');
        const rejected = results.filter((r) => r.status === 'rejected');
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        const err = (rejected[0] as PromiseRejectedResult).reason;
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code).toBe(ErrorCodes.POOL_FULL);

        const [pool] = await testDb.select().from(pools).where(eq(pools.id, poolId));
        expect(pool!.seatsTaken).toBe(3);
        const members = await testDb
          .select()
          .from(poolMembers)
          .where(eq(poolMembers.poolId, poolId));
        const activeSeats = members
          .filter((m) => m.status === 'ACTIVE')
          .reduce((s, m) => s + m.seats, 0);
        expect(activeSeats).toBe(3);
      }
    },
    120_000,
  );

  it('double accept: only one pool contains Nusrat', async () => {
    await seed({ databaseUrl: url, reset: true });
    zoneCache = await ZoneCache.load(db);

    const passwordHash = await hash('TeslaPool!2026');
    const [karim] = await testDb
      .insert(users)
      .values({
        name: 'Karim',
        email: 'karim@teslapool.test',
        phone: '+8801700000099',
        role: 'DRIVER',
        passwordHash,
      })
      .returning();
    await testDb.insert(driverProfiles).values({
      userId: karim!.id,
      isOnline: true,
      currentZoneId: BANANI,
      homeZoneId: BANANI,
    });
    await testDb.insert(vehicles).values({
      driverId: karim!.id,
      name: 'Rocket',
      plate: 'DHAKA-TESLA-99',
      capacity: 3,
    });
    await testDb.insert(wallets).values({ userId: karim!.id, balancePaisa: 0 });

    await setOnline('jashim@teslapool.test', BANANI);
    const nusratId = await userId('nusrat@teslapool.test');
    const [nusratReq] = await testDb
      .insert(rideRequests)
      .values({
        passengerId: nusratId,
        pickupZoneId: BANANI,
        dropoffZoneId: MOHAKHALI,
        seats: 1,
        allowPool: true,
        paymentMethod: 'WALLET',
        distanceM: 2_500,
        soloFarePaisa: 10_250,
        status: 'REQUESTED',
      })
      .returning();

    const d = await deps();
    const jashimId = await userId('jashim@teslapool.test');
    const results = await Promise.allSettled([
      acceptRequest(dbA, jashimId, nusratReq!.id, d),
      acceptRequest(dbB, karim!.id, nusratReq!.id, d),
    ]);

    const ok = results.filter((r) => r.status === 'fulfilled');
    const fail = results.filter((r) => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(fail).toHaveLength(1);

    const memberships = await testDb
      .select()
      .from(poolMembers)
      .where(eq(poolMembers.rideRequestId, nusratReq!.id));
    const active = memberships.filter((m) => m.status === 'ACTIVE');
    expect(active).toHaveLength(1);
  });

  it(
    'HTTP last-seat race via POST /pools/:id/members',
    async () => {
      const jashim = await login(app, 'jashim@teslapool.test');
      for (let i = 0; i < ITERATIONS; i++) {
        await resetRideData();
        zoneCache = await ZoneCache.load(db);
        const { poolId, nusratReqId, shirinReqId } = await setupLastSeatRace();

        const results = await Promise.allSettled([
          app.inject({
            method: 'POST',
            url: `/api/v1/pools/${poolId}/members`,
            cookies: { dtp_session: jashim },
            payload: { rideRequestId: nusratReqId },
          }),
          app.inject({
            method: 'POST',
            url: `/api/v1/pools/${poolId}/members`,
            cookies: { dtp_session: jashim },
            payload: { rideRequestId: shirinReqId },
          }),
        ]);

        const bodies = await Promise.all(
          results.map(async (r) => {
            if (r.status !== 'fulfilled') throw r.reason;
            return r.value;
          }),
        );
        const wins = bodies.filter((b) => b.statusCode === 201);
        const losses = bodies.filter((b) => b.statusCode === 409);
        expect(wins).toHaveLength(1);
        expect(losses).toHaveLength(1);
        expect(losses[0]!.json().error.code).toBe('POOL_FULL');

        const [pool] = await testDb.select().from(pools).where(eq(pools.id, poolId));
        expect(pool!.seatsTaken).toBe(3);
      }
    },
    180_000,
  );

  it('double submit without idempotency key creates exactly one ride', async () => {
    await seed({ databaseUrl: url, reset: true });
    const nusrat = await login(app, 'nusrat@teslapool.test');
    const payload = {
      pickupZoneId: BANANI,
      dropoffZoneId: MOHAKHALI,
      seats: 1,
      allowPool: true,
      paymentMethod: 'WALLET' as const,
    };
    const results = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/api/v1/rides',
        cookies: { dtp_session: nusrat },
        payload,
      }),
      app.inject({
        method: 'POST',
        url: '/api/v1/rides',
        cookies: { dtp_session: nusrat },
        payload,
      }),
    ]);
    const created = results.filter((r) => r.statusCode === 201);
    const conflict = results.filter((r) => r.statusCode === 409);
    expect(created.length + conflict.length).toBe(2);
    expect(created).toHaveLength(1);
    expect(conflict[0]?.json().error.code).toBe('ACTIVE_RIDE_EXISTS');

    const rides = await testDb
      .select()
      .from(rideRequests)
      .where(
        sql`${rideRequests.passengerId} = ${await userId('nusrat@teslapool.test')} AND ${rideRequests.status} IN ('REQUESTED','MATCHED','DRIVER_ARRIVED','STARTED')`,
      );
    expect(rides).toHaveLength(1);
  });
});
