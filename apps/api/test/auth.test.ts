import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createDb, createPool } from '../src/db/client.js';
import { wallets } from '../src/db/schema.js';
import { SIGNUP_WALLET_PAISA } from '../src/modules/auth/routes.js';
import { testDb } from './setup.js';

describe('auth', () => {
  const config = loadConfig();
  const url = config.TEST_DATABASE_URL ?? config.DATABASE_URL;
  const pool = createPool(url);
  const db = createDb(pool);
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp({ db, config, logger: false });
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('signup → me returns the passenger and seeds ৳200 wallet', async () => {
    const signup = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/signup',
      payload: {
        name: 'Nusrat',
        email: 'nusrat-auth@teslapool.test',
        phone: '+8801711000001',
        password: 'TeslaPool!2026',
      },
    });
    expect(signup.statusCode).toBe(201);
    expect(signup.json().user.role).toBe('PASSENGER');
    const cookie = signup.cookies.find((c) => c.name === 'dtp_session');
    expect(cookie?.value).toBeTruthy();

    const me = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      cookies: { dtp_session: cookie!.value },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.email).toBe('nusrat-auth@teslapool.test');

    const [wallet] = await testDb
      .select()
      .from(wallets)
      .where(eq(wallets.userId, signup.json().user.id));
    expect(wallet?.balancePaisa).toBe(SIGNUP_WALLET_PAISA);
  });

  it('login with wrong password returns 401 UNAUTHENTICATED', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/signup',
      payload: {
        name: 'Rafiq',
        email: 'rafiq-auth@teslapool.test',
        phone: '+8801711000002',
        password: 'TeslaPool!2026',
      },
    });

    const bad = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'rafiq-auth@teslapool.test',
        password: 'wrong-password',
      },
    });
    expect(bad.statusCode).toBe(401);
    expect(bad.json().error.code).toBe('UNAUTHENTICATED');
    expect(bad.json().error.message).toBe('Email or password is incorrect');
  });

  it('duplicate email returns 409 EMAIL_TAKEN', async () => {
    const payload = {
      name: 'Shirin',
      email: 'shirin-auth@teslapool.test',
      phone: '+8801711000003',
      password: 'TeslaPool!2026',
    };
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/signup', payload })).statusCode).toBe(
      201,
    );
    const dup = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/signup',
      payload: { ...payload, phone: '+8801711000099' },
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('EMAIL_TAKEN');
  });

  it('passenger calling driver-only route gets 403', async () => {
    const signup = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/signup',
      payload: {
        name: 'Passenger',
        email: 'pax-auth@teslapool.test',
        phone: '+8801711000004',
        password: 'TeslaPool!2026',
      },
    });
    const cookie = signup.cookies.find((c) => c.name === 'dtp_session');
    const denied = await app.inject({
      method: 'GET',
      url: '/api/v1/driver/ping',
      cookies: { dtp_session: cookie!.value },
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe('FORBIDDEN');
  });

  it('11th login in a minute returns 429 RATE_LIMITED', async () => {
    const limitedApp = await buildApp({ db, config, logger: false });
    try {
      await limitedApp.inject({
        method: 'POST',
        url: '/api/v1/auth/signup',
        payload: {
          name: 'Rate',
          email: 'rate-auth@teslapool.test',
          phone: '+8801711000005',
          password: 'TeslaPool!2026',
        },
      });

      let lastStatus = 0;
      for (let i = 0; i < 11; i++) {
        const res = await limitedApp.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          payload: {
            email: 'rate-auth@teslapool.test',
            password: 'wrong',
          },
          remoteAddress: '203.0.113.50',
        });
        lastStatus = res.statusCode;
      }
      expect(lastStatus).toBe(429);
    } finally {
      await limitedApp.close();
    }
  });
});
