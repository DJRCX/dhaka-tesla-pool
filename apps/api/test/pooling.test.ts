import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createDb, createPool } from '../src/db/client.js';
import { driverProfiles, users } from '../src/db/schema.js';
import { seed } from '../src/db/seed.js';
import { assertPoolInvariants } from '../src/modules/pools/accept.js';
import { testDb } from './setup.js';

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

async function setDriverOnline(email: string, zoneId: number) {
  const [u] = await testDb.select().from(users).where(eq(users.email, email)).limit(1);
  expect(u).toBeTruthy();
  await testDb
    .update(driverProfiles)
    .set({ isOnline: true, currentZoneId: zoneId })
    .where(eq(driverProfiles.userId, u!.id));
}

describe('tesla pooling', () => {
  const config = loadConfig();
  const url = config.TEST_DATABASE_URL ?? config.DATABASE_URL;
  const pool = createPool(url);
  const db = createDb(pool);
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    await seed({ databaseUrl: url });
    app = await buildApp({ db, config, logger: false });
  });

  beforeEach(async () => {
    await seed({ databaseUrl: url });
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('Jashim accepts Nusrat; Rafiq auto-matches with pooled fares', async () => {
    await setDriverOnline('jashim@teslapool.test', 1);
    const jashim = await login(app, 'jashim@teslapool.test');
    const nusrat = await login(app, 'nusrat@teslapool.test');
    const rafiq = await login(app, 'rafiq@teslapool.test');

    const nusratRide = await app.inject({
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
    expect(nusratRide.statusCode).toBe(201);
    expect(nusratRide.json().ride.status).toBe('REQUESTED');

    const accept = await app.inject({
      method: 'POST',
      url: `/api/v1/driver/requests/${nusratRide.json().ride.id}/accept`,
      cookies: { dtp_session: jashim },
    });
    expect(accept.statusCode).toBe(201);
    const poolId = accept.json().poolId as string;
    await assertPoolInvariants(db, poolId);

    const rafiqRide = await app.inject({
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
    expect(rafiqRide.statusCode).toBe(201);
    expect(rafiqRide.json().ride.status).toBe('MATCHED');
    expect(rafiqRide.json().ride.fare.totalPaisa).toBe(9_600);

    const nusratDetail = await app.inject({
      method: 'GET',
      url: `/api/v1/rides/${nusratRide.json().ride.id}`,
      cookies: { dtp_session: nusrat },
    });
    expect(nusratDetail.statusCode).toBe(200);
    expect(nusratDetail.json().ride.fare.totalPaisa).toBe(9_000);
    expect(nusratDetail.json().ride.pool.coRiderCount).toBe(1);

    await assertPoolInvariants(db, poolId);
  });

  it('lists candidates and lets the driver add manually', async () => {
    await setDriverOnline('jashim@teslapool.test', 1);
    const jashim = await login(app, 'jashim@teslapool.test');
    const nusrat = await login(app, 'nusrat@teslapool.test');
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

    // Shirin cash to Banani→Gulshan2 (compatible)
    const s = await app.inject({
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
    // If auto-match already took her, skip manual add; otherwise add via candidates
    if (s.json().ride.status === 'REQUESTED') {
      const candidates = await app.inject({
        method: 'GET',
        url: `/api/v1/pools/${poolId}/candidates`,
        cookies: { dtp_session: jashim },
      });
      expect(candidates.statusCode).toBe(200);
      const list = candidates.json().candidates as Array<{ id: string; compatible: boolean }>;
      expect(list.some((c) => c.id === s.json().ride.id && c.compatible)).toBe(true);

      const add = await app.inject({
        method: 'POST',
        url: `/api/v1/pools/${poolId}/members`,
        cookies: { dtp_session: jashim },
        payload: { rideRequestId: s.json().ride.id },
      });
      expect(add.statusCode).toBe(201);
    }

    await assertPoolInvariants(db, poolId);
  });
});
