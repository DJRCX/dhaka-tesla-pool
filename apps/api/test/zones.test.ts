import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createDb, createPool } from '../src/db/client.js';
import { seed } from '../src/db/seed.js';

describe('zones and fare quote', () => {
  const config = loadConfig();
  const url = config.TEST_DATABASE_URL ?? config.DATABASE_URL;
  const pool = createPool(url);
  const db = createDb(pool);
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    await seed({ databaseUrl: url });
    app = await buildApp({ db, config, logger: false });
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('lists zones', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/zones' });
    expect(res.statusCode).toBe(200);
    expect(res.json().zones.length).toBe(10);
    expect(res.json().zones[0].slug).toBe('banani');
  });

  it('quotes Banani → Mohakhali as 10,250 solo / 9,000 pooled', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/fares/quote?pickup=1&dropoff=4',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.distanceM).toBe(2_500);
    expect(body.solo.totalPaisa).toBe(10_250);
    expect(body.pooled.totalPaisa).toBe(9_000);
  });

  it('rejects same pickup and dropoff with 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/fares/quote?pickup=1&dropoff=1',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });
});
