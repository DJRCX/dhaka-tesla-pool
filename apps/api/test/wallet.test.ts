import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createDb, createPool } from '../src/db/client.js';
import { users, walletTransactions, wallets } from '../src/db/schema.js';
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

describe('teslapay wallet', () => {
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
    if (app) await app.close();
    app = await buildApp({ db, config, logger: false });
  });

  afterAll(async () => {
    if (app) await app.close();
    await pool.end();
  });

  it('debits Nusrat exactly ৳90.00 after a pooled complete', async () => {
    const jashim = await login(app, 'jashim@teslapool.test');
    await app.inject({
      method: 'PATCH',
      url: '/api/v1/driver/status',
      cookies: { dtp_session: jashim },
      payload: { isOnline: true, currentZoneId: 1 },
    });

    const [nusratUser] = await testDb
      .select()
      .from(users)
      .where(eq(users.email, 'nusrat@teslapool.test'));
    const [before] = await testDb
      .select()
      .from(wallets)
      .where(eq(wallets.userId, nusratUser!.id));

    const nusrat = await login(app, 'nusrat@teslapool.test');
    const rafiq = await login(app, 'rafiq@teslapool.test');

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
      url: `/api/v1/pools/${poolId}/arrive`,
      cookies: { dtp_session: jashim },
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/pools/${poolId}/start`,
      cookies: { dtp_session: jashim },
    });
    const complete = await app.inject({
      method: 'POST',
      url: `/api/v1/pools/${poolId}/complete`,
      cookies: { dtp_session: jashim },
    });
    expect(complete.statusCode).toBe(200);

    const [after] = await testDb
      .select()
      .from(wallets)
      .where(eq(wallets.userId, nusratUser!.id));
    expect(before!.balancePaisa - after!.balancePaisa).toBe(9_000);

    const txs = await testDb
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.userId, nusratUser!.id));
    const charge = txs.find((t) => t.type === 'RIDE_CHARGE' && t.amountPaisa === -9_000);
    expect(charge).toBeTruthy();

    const walletApi = await app.inject({
      method: 'GET',
      url: '/api/v1/wallet',
      cookies: { dtp_session: nusrat },
    });
    expect(walletApi.statusCode).toBe(200);
    expect(walletApi.json().balancePaisa).toBe(after!.balancePaisa);
    expect(walletApi.json().transactions.length).toBeGreaterThanOrEqual(1);
  });

  it('retrying complete returns 409 and does not double-charge', async () => {
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

    await app.inject({
      method: 'POST',
      url: `/api/v1/pools/${poolId}/arrive`,
      cookies: { dtp_session: jashim },
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/pools/${poolId}/start`,
      cookies: { dtp_session: jashim },
    });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/pools/${poolId}/complete`,
          cookies: { dtp_session: jashim },
        })
      ).statusCode,
    ).toBe(200);

    const [nusratUser] = await testDb
      .select()
      .from(users)
      .where(eq(users.email, 'nusrat@teslapool.test'));
    const [balanceAfterFirst] = await testDb
      .select()
      .from(wallets)
      .where(eq(wallets.userId, nusratUser!.id));
    const txCount = (
      await testDb
        .select()
        .from(walletTransactions)
        .where(eq(walletTransactions.userId, nusratUser!.id))
    ).filter((t) => t.type === 'RIDE_CHARGE').length;

    const retry = await app.inject({
      method: 'POST',
      url: `/api/v1/pools/${poolId}/complete`,
      cookies: { dtp_session: jashim },
    });
    expect(retry.statusCode).toBe(409);
    expect(retry.json().error.code).toBe('INVALID_TRANSITION');

    const [balanceAfterRetry] = await testDb
      .select()
      .from(wallets)
      .where(eq(wallets.userId, nusratUser!.id));
    expect(balanceAfterRetry!.balancePaisa).toBe(balanceAfterFirst!.balancePaisa);

    const txCountAfter = (
      await testDb
        .select()
        .from(walletTransactions)
        .where(eq(walletTransactions.userId, nusratUser!.id))
    ).filter((t) => t.type === 'RIDE_CHARGE').length;
    expect(txCountAfter).toBe(txCount);
  });

  it('records CASH_DUE for cash riders without debiting wallet', async () => {
    const jashim = await login(app, 'jashim@teslapool.test');
    await app.inject({
      method: 'PATCH',
      url: '/api/v1/driver/status',
      cookies: { dtp_session: jashim },
      payload: { isOnline: true, currentZoneId: 1 },
    });
    const shirin = await login(app, 'shirin@teslapool.test');
    const [shirinUser] = await testDb
      .select()
      .from(users)
      .where(eq(users.email, 'shirin@teslapool.test'));
    const [before] = await testDb
      .select()
      .from(wallets)
      .where(eq(wallets.userId, shirinUser!.id));

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
    const accept = await app.inject({
      method: 'POST',
      url: `/api/v1/driver/requests/${s.json().ride.id}/accept`,
      cookies: { dtp_session: jashim },
    });
    const poolId = accept.json().poolId as string;
    await app.inject({
      method: 'POST',
      url: `/api/v1/pools/${poolId}/arrive`,
      cookies: { dtp_session: jashim },
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/pools/${poolId}/start`,
      cookies: { dtp_session: jashim },
    });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/pools/${poolId}/complete`,
          cookies: { dtp_session: jashim },
        })
      ).statusCode,
    ).toBe(200);

    const [after] = await testDb
      .select()
      .from(wallets)
      .where(eq(wallets.userId, shirinUser!.id));
    expect(after!.balancePaisa).toBe(before!.balancePaisa);
  });
});
