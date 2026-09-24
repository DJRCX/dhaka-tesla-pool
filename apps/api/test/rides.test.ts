import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createDb, createPool } from '../src/db/client.js';
import { rideRequests, users, wallets } from '../src/db/schema.js';
import { seed } from '../src/db/seed.js';
import { testDb } from './setup.js';

async function login(
  app: Awaited<ReturnType<typeof buildApp>>,
  email: string,
  password = 'TeslaPool!2026',
) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password },
  });
  expect(res.statusCode).toBe(200);
  const cookie = res.cookies.find((c) => c.name === 'dtp_session');
  expect(cookie?.value).toBeTruthy();
  return cookie!.value;
}

describe('ride requests', () => {
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
    // Re-seed cast after setup.ts truncates tables
    await seed({ databaseUrl: url });
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('creates a ride for Nusrat (happy path 201)', async () => {
    const cookie = await login(app, 'nusrat@teslapool.test');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/rides',
      cookies: { dtp_session: cookie },
      payload: {
        pickupZoneId: 1,
        dropoffZoneId: 4,
        seats: 1,
        allowPool: true,
        paymentMethod: 'WALLET',
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().ride.status).toBe('REQUESTED');
    expect(res.json().ride.soloFarePaisa).toBe(10_250);
    expect(res.json().ride.fare.totalPaisa).toBe(10_250);
  });

  it('returns the same ride for a repeated Idempotency-Key', async () => {
    const cookie = await login(app, 'nusrat@teslapool.test');
    const payload = {
      pickupZoneId: 1,
      dropoffZoneId: 4,
      seats: 1,
      allowPool: true,
      paymentMethod: 'WALLET',
    };
    const headers = { 'idempotency-key': 'nusrat-banani-mohakhali-1' };
    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/rides',
      cookies: { dtp_session: cookie },
      headers,
      payload,
    });
    expect(first.statusCode).toBe(201);
    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/rides',
      cookies: { dtp_session: cookie },
      headers,
      payload,
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().ride.id).toBe(first.json().ride.id);
  });

  it('rejects a second active request with 409 ACTIVE_RIDE_EXISTS', async () => {
    const cookie = await login(app, 'rafiq@teslapool.test');
    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/rides',
      cookies: { dtp_session: cookie },
      payload: {
        pickupZoneId: 1,
        dropoffZoneId: 2,
        seats: 1,
        allowPool: true,
        paymentMethod: 'WALLET',
      },
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/rides',
      cookies: { dtp_session: cookie },
      payload: {
        pickupZoneId: 1,
        dropoffZoneId: 3,
        seats: 1,
        allowPool: true,
        paymentMethod: 'WALLET',
      },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('ACTIVE_RIDE_EXISTS');
  });

  it('Shirin wallet → 422 INSUFFICIENT_BALANCE; cash → 201', async () => {
    const cookie = await login(app, 'shirin@teslapool.test');
    // Solo Banani→Gulshan2 = 8000; Shirin wallet is 5000
    const [shirin] = await testDb
      .select()
      .from(users)
      .where(eq(users.email, 'shirin@teslapool.test'));
    const [wallet] = await testDb
      .select()
      .from(wallets)
      .where(eq(wallets.userId, shirin!.id));
    expect(wallet!.balancePaisa).toBe(5_000);

    const walletTry = await app.inject({
      method: 'POST',
      url: '/api/v1/rides',
      cookies: { dtp_session: cookie },
      payload: {
        pickupZoneId: 1,
        dropoffZoneId: 3,
        seats: 1,
        allowPool: true,
        paymentMethod: 'WALLET',
      },
    });
    expect(walletTry.statusCode).toBe(422);
    expect(walletTry.json().error.code).toBe('INSUFFICIENT_BALANCE');

    const cash = await app.inject({
      method: 'POST',
      url: '/api/v1/rides',
      cookies: { dtp_session: cookie },
      payload: {
        pickupZoneId: 1,
        dropoffZoneId: 3,
        seats: 1,
        allowPool: true,
        paymentMethod: 'CASH',
      },
    });
    expect(cash.statusCode).toBe(201);
  });

  it('Nusrat fetching Rafiq ride → 404 and no other passenger names', async () => {
    const rafiqCookie = await login(app, 'rafiq@teslapool.test');
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/rides',
      cookies: { dtp_session: rafiqCookie },
      payload: {
        pickupZoneId: 1,
        dropoffZoneId: 2,
        seats: 1,
        allowPool: true,
        paymentMethod: 'WALLET',
      },
    });
    const rideId = created.json().ride.id;

    const nusratCookie = await login(app, 'nusrat@teslapool.test');
    const denied = await app.inject({
      method: 'GET',
      url: `/api/v1/rides/${rideId}`,
      cookies: { dtp_session: nusratCookie },
    });
    expect(denied.statusCode).toBe(404);

    const own = await app.inject({
      method: 'GET',
      url: `/api/v1/rides/${rideId}`,
      cookies: { dtp_session: rafiqCookie },
    });
    expect(own.statusCode).toBe(200);
    const body = JSON.stringify(own.json());
    expect(body).not.toMatch(/Nusrat/i);
    expect(body).not.toMatch(/Shirin/i);
  });

  it('cancels a REQUESTED ride', async () => {
    const cookie = await login(app, 'nusrat@teslapool.test');
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/rides',
      cookies: { dtp_session: cookie },
      payload: {
        pickupZoneId: 1,
        dropoffZoneId: 4,
        seats: 1,
        allowPool: true,
        paymentMethod: 'WALLET',
      },
    });
    const cancel = await app.inject({
      method: 'POST',
      url: `/api/v1/rides/${created.json().ride.id}/cancel`,
      cookies: { dtp_session: cookie },
      payload: { reason: 'changed plans' },
    });
    expect(cancel.statusCode).toBe(200);
    expect(cancel.json().ride.status).toBe('CANCELLED');
  });

  it('cancel STARTED → 409; cancel someone else → 404', async () => {
    const cookie = await login(app, 'nusrat@teslapool.test');
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/rides',
      cookies: { dtp_session: cookie },
      payload: {
        pickupZoneId: 1,
        dropoffZoneId: 4,
        seats: 1,
        allowPool: true,
        paymentMethod: 'WALLET',
      },
    });
    const rideId = created.json().ride.id as string;
    await testDb
      .update(rideRequests)
      .set({ status: 'STARTED' })
      .where(eq(rideRequests.id, rideId));

    const bad = await app.inject({
      method: 'POST',
      url: `/api/v1/rides/${rideId}/cancel`,
      cookies: { dtp_session: cookie },
      payload: {},
    });
    expect(bad.statusCode).toBe(409);
    expect(bad.json().error.code).toBe('INVALID_TRANSITION');

    const rafiqCookie = await login(app, 'rafiq@teslapool.test');
    const other = await app.inject({
      method: 'POST',
      url: `/api/v1/rides/${rideId}/cancel`,
      cookies: { dtp_session: rafiqCookie },
      payload: {},
    });
    expect(other.statusCode).toBe(404);
  });
});
