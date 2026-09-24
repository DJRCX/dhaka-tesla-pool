import { eq } from 'drizzle-orm';
import { hash } from '@node-rs/argon2';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createDb, createPool } from '../src/db/client.js';
import { driverProfiles, rideRequests, users, vehicles, wallets } from '../src/db/schema.js';
import { seed } from '../src/db/seed.js';
import { testDb } from './setup.js';

async function login(app: Awaited<ReturnType<typeof buildApp>>, email: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password: 'TeslaPool!2026' },
  });
  expect(res.statusCode).toBe(200);
  return res.cookies.find((c) => c.name === 'dtp_session')!.value;
}

describe('driver flow', () => {
  const config = loadConfig();
  const url = config.TEST_DATABASE_URL ?? config.DATABASE_URL;
  const pool = createPool(url);
  const db = createDb(pool);
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    await seed({ databaseUrl: url, reset: true });
  });

  beforeEach(async () => {
    await seed({ databaseUrl: url, reset: true });
    // Fresh app per test so auth rate-limit state does not leak across cases
    if (app) await app.close();
    app = await buildApp({ db, config, logger: false });
  });

  afterAll(async () => {
    if (app) await app.close();
    await pool.end();
  });

  it('goes online/offline and lists waiting requests', async () => {
    const jashim = await login(app, 'jashim@teslapool.test');
    const offlineFeed = await app.inject({
      method: 'GET',
      url: '/api/v1/driver/requests',
      cookies: { dtp_session: jashim },
    });
    expect(offlineFeed.statusCode).toBe(200);
    expect(offlineFeed.json().requests).toEqual([]);

    const noZone = await app.inject({
      method: 'PATCH',
      url: '/api/v1/driver/status',
      cookies: { dtp_session: jashim },
      payload: { isOnline: true },
    });
    expect(noZone.statusCode).toBe(400);

    const online = await app.inject({
      method: 'PATCH',
      url: '/api/v1/driver/status',
      cookies: { dtp_session: jashim },
      payload: { isOnline: true, currentZoneId: 1 },
    });
    expect(online.statusCode).toBe(200);
    expect(online.json().isOnline).toBe(true);

    const nusrat = await login(app, 'nusrat@teslapool.test');
    await app.inject({
      method: 'POST',
      url: '/api/v1/rides',
      cookies: { dtp_session: nusrat },
      payload: {
        pickupZoneId: 1,
        dropoffZoneId: 4,
        seats: 1,
        allowPool: true,
        paymentMethod: 'WALLET',
      },
    });

    const feed = await app.inject({
      method: 'GET',
      url: '/api/v1/driver/requests',
      cookies: { dtp_session: jashim },
    });
    expect(feed.statusCode).toBe(200);
    expect(feed.json().requests.length).toBeGreaterThanOrEqual(1);
    expect(feed.json().requests[0].passengerFirstName).toBe('Nusrat');
  });

  it('runs Nusrat+Rafiq+Shirin through arrive→start→complete', async () => {
    const jashim = await login(app, 'jashim@teslapool.test');
    await app.inject({
      method: 'PATCH',
      url: '/api/v1/driver/status',
      cookies: { dtp_session: jashim },
      payload: { isOnline: true, currentZoneId: 1 },
    });

    const nusrat = await login(app, 'nusrat@teslapool.test');
    const rafiq = await login(app, 'rafiq@teslapool.test');
    const shirin = await login(app, 'shirin@teslapool.test');

    const n = await app.inject({
      method: 'POST',
      url: '/api/v1/rides',
      cookies: { dtp_session: nusrat },
      payload: {
        pickupZoneId: 1,
        dropoffZoneId: 4,
        seats: 1,
        allowPool: true,
        paymentMethod: 'WALLET',
      },
    });
    const accept = await app.inject({
      method: 'POST',
      url: `/api/v1/driver/requests/${n.json().ride.id}/accept`,
      cookies: { dtp_session: jashim },
    });
    expect(accept.statusCode).toBe(201);
    const poolId = accept.json().poolId as string;

    await app.inject({
      method: 'POST',
      url: '/api/v1/rides',
      cookies: { dtp_session: rafiq },
      payload: {
        pickupZoneId: 1,
        dropoffZoneId: 2,
        seats: 1,
        allowPool: true,
        paymentMethod: 'WALLET',
      },
    });
    await app.inject({
      method: 'POST',
      url: '/api/v1/rides',
      cookies: { dtp_session: shirin },
      payload: {
        pickupZoneId: 1,
        dropoffZoneId: 3,
        seats: 1,
        allowPool: true,
        paymentMethod: 'CASH',
      },
    });

    const current = await app.inject({
      method: 'GET',
      url: '/api/v1/driver/pools/current',
      cookies: { dtp_session: jashim },
    });
    expect(current.statusCode).toBe(200);
    expect(current.json().pool.id).toBe(poolId);
    expect(current.json().pool.nextActions).toEqual(['arrive', 'cancel']);
    expect(current.json().pool.seatsTaken).toBe(3);

    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/pools/${poolId}/arrive`,
          cookies: { dtp_session: jashim },
        })
      ).statusCode,
    ).toBe(200);

    const afterArrive = await app.inject({
      method: 'GET',
      url: '/api/v1/driver/pools/current',
      cookies: { dtp_session: jashim },
    });
    expect(afterArrive.json().pool.nextActions).toEqual(['start', 'cancel']);

    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/pools/${poolId}/start`,
          cookies: { dtp_session: jashim },
        })
      ).statusCode,
    ).toBe(200);

    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/pools/${poolId}/complete`,
          cookies: { dtp_session: jashim },
        })
      ).statusCode,
    ).toBe(200);

    const done = await app.inject({
      method: 'GET',
      url: '/api/v1/driver/pools/current',
      cookies: { dtp_session: jashim },
    });
    expect(done.json().pool).toBeNull();

    const history = await app.inject({
      method: 'GET',
      url: '/api/v1/driver/pools',
      cookies: { dtp_session: jashim },
    });
    expect(history.json().pools.some((p: { id: string; status: string }) => p.id === poolId && p.status === 'COMPLETED')).toBe(
      true,
    );
  });

  it('rejects out-of-order transitions and foreign pool actions', async () => {
    const jashim = await login(app, 'jashim@teslapool.test');
    await app.inject({
      method: 'PATCH',
      url: '/api/v1/driver/status',
      cookies: { dtp_session: jashim },
      payload: { isOnline: true, currentZoneId: 1 },
    });
    const nusrat = await login(app, 'nusrat@teslapool.test');
    const n = await app.inject({
      method: 'POST',
      url: '/api/v1/rides',
      cookies: { dtp_session: nusrat },
      payload: {
        pickupZoneId: 1,
        dropoffZoneId: 4,
        seats: 1,
        allowPool: true,
        paymentMethod: 'WALLET',
      },
    });
    const accept = await app.inject({
      method: 'POST',
      url: `/api/v1/driver/requests/${n.json().ride.id}/accept`,
      cookies: { dtp_session: jashim },
    });
    const poolId = accept.json().poolId as string;

    const completeEarly = await app.inject({
      method: 'POST',
      url: `/api/v1/pools/${poolId}/complete`,
      cookies: { dtp_session: jashim },
    });
    expect(completeEarly.statusCode).toBe(409);
    expect(completeEarly.json().error.code).toBe('INVALID_TRANSITION');

    await app.inject({
      method: 'POST',
      url: `/api/v1/pools/${poolId}/arrive`,
      cookies: { dtp_session: jashim },
    });
    const arriveTwice = await app.inject({
      method: 'POST',
      url: `/api/v1/pools/${poolId}/arrive`,
      cookies: { dtp_session: jashim },
    });
    expect(arriveTwice.statusCode).toBe(409);

    const passwordHash = await hash('TeslaPool!2026');
    const [karim] = await testDb
      .insert(users)
      .values({
        name: 'Karim',
        email: 'karim-flow@teslapool.test',
        phone: '+8801700000088',
        role: 'DRIVER',
        passwordHash,
      })
      .returning();
    await testDb.insert(driverProfiles).values({
      userId: karim!.id,
      isOnline: true,
      currentZoneId: 1,
    });
    await testDb.insert(vehicles).values({
      driverId: karim!.id,
      name: 'Rocket',
      plate: 'DHAKA-TESLA-88',
      capacity: 3,
    });
    await testDb.insert(wallets).values({ userId: karim!.id, balancePaisa: 0 });

    const karimCookie = await login(app, 'karim-flow@teslapool.test');
    const foreign = await app.inject({
      method: 'POST',
      url: `/api/v1/pools/${poolId}/start`,
      cookies: { dtp_session: karimCookie },
    });
    expect(foreign.statusCode).toBe(404);
  });

  it('driver cancel re-queues passengers; offline blocked with active pool', async () => {
    const jashim = await login(app, 'jashim@teslapool.test');
    await app.inject({
      method: 'PATCH',
      url: '/api/v1/driver/status',
      cookies: { dtp_session: jashim },
      payload: { isOnline: true, currentZoneId: 1 },
    });
    const nusrat = await login(app, 'nusrat@teslapool.test');
    const rafiq = await login(app, 'rafiq@teslapool.test');
    const shirin = await login(app, 'shirin@teslapool.test');

    const n = await app.inject({
      method: 'POST',
      url: '/api/v1/rides',
      cookies: { dtp_session: nusrat },
      payload: {
        pickupZoneId: 1,
        dropoffZoneId: 4,
        seats: 1,
        allowPool: true,
        paymentMethod: 'WALLET',
      },
    });
    const accept = await app.inject({
      method: 'POST',
      url: `/api/v1/driver/requests/${n.json().ride.id}/accept`,
      cookies: { dtp_session: jashim },
    });
    const poolId = accept.json().poolId as string;

    await app.inject({
      method: 'POST',
      url: '/api/v1/rides',
      cookies: { dtp_session: rafiq },
      payload: {
        pickupZoneId: 1,
        dropoffZoneId: 2,
        seats: 1,
        allowPool: true,
        paymentMethod: 'WALLET',
      },
    });
    await app.inject({
      method: 'POST',
      url: '/api/v1/rides',
      cookies: { dtp_session: shirin },
      payload: {
        pickupZoneId: 1,
        dropoffZoneId: 3,
        seats: 1,
        allowPool: true,
        paymentMethod: 'CASH',
      },
    });

    const offlineBlocked = await app.inject({
      method: 'PATCH',
      url: '/api/v1/driver/status',
      cookies: { dtp_session: jashim },
      payload: { isOnline: false },
    });
    expect(offlineBlocked.statusCode).toBe(409);
    expect(offlineBlocked.json().error.code).toBe('ACTIVE_POOL_EXISTS');

    const cancel = await app.inject({
      method: 'POST',
      url: `/api/v1/pools/${poolId}/cancel`,
      cookies: { dtp_session: jashim },
    });
    expect(cancel.statusCode).toBe(200);

    const requeued = await testDb
      .select()
      .from(rideRequests)
      .where(eq(rideRequests.status, 'REQUESTED'));
    expect(requeued.length).toBeGreaterThanOrEqual(3);

    const offline = await app.inject({
      method: 'PATCH',
      url: '/api/v1/driver/status',
      cookies: { dtp_session: jashim },
      payload: { isOnline: false },
    });
    expect(offline.statusCode).toBe(200);
  });
});
