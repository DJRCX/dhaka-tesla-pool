import { describe, expect, it } from 'vitest';
import {
  AppError,
  ErrorCodes,
  extractPgError,
  mapPostgresError,
} from '../src/lib/errors.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createDb, createPool } from '../src/db/client.js';

describe('mapPostgresError', () => {
  it('maps active-request unique to ACTIVE_RIDE_EXISTS', () => {
    const err = mapPostgresError({
      code: '23505',
      constraint: 'one_active_request_per_passenger',
    });
    expect(err).toBeInstanceOf(AppError);
    expect(err?.code).toBe(ErrorCodes.ACTIVE_RIDE_EXISTS);
    expect(err?.statusCode).toBe(409);
  });

  it('maps seats check to POOL_FULL', () => {
    const err = mapPostgresError({
      code: '23514',
      constraint: 'pools_seats_within_capacity',
    });
    expect(err?.code).toBe(ErrorCodes.POOL_FULL);
  });

  it('returns null for unknown constraint (caller should 500)', () => {
    expect(
      mapPostgresError({ code: '23505', constraint: 'totally_unknown' }),
    ).toBeNull();
  });

  it('unwraps drizzle-wrapped pg errors', () => {
    const inner = { code: '23514', constraint: 'pools_seats_within_capacity' };
    const wrapped = { message: 'Failed query', cause: inner };
    expect(extractPgError(wrapped)?.constraint).toBe('pools_seats_within_capacity');
  });
});

describe('error handler via inject', () => {
  it('returns AppError, Zod, mapped pg, unknown pg→500, and INTERNAL envelopes', async () => {
    const config = loadConfig();
    const url = config.TEST_DATABASE_URL ?? config.DATABASE_URL;
    const pool = createPool(url);
    const db = createDb(pool);
    const app = await buildApp({ db, config, logger: false });

    const appErr = await app.inject({ method: 'GET', url: '/__test/error/app' });
    expect(appErr.statusCode).toBe(409);
    expect(appErr.json().error.code).toBe('POOL_FULL');
    expect(appErr.json().error.requestId).toBeTruthy();

    const zodErr = await app.inject({ method: 'GET', url: '/__test/error/zod' });
    expect(zodErr.statusCode).toBe(400);
    expect(zodErr.json().error.code).toBe('VALIDATION_ERROR');
    expect(zodErr.json().error.details).toBeTruthy();

    const pgMapped = await app.inject({ method: 'GET', url: '/__test/error/pg-mapped' });
    expect(pgMapped.statusCode).toBe(409);
    expect(pgMapped.json().error.code).toBe('ACTIVE_RIDE_EXISTS');

    const pgUnknown = await app.inject({ method: 'GET', url: '/__test/error/pg-unknown' });
    expect(pgUnknown.statusCode).toBe(500);
    expect(pgUnknown.json().error.code).toBe('INTERNAL');

    const boom = await app.inject({ method: 'GET', url: '/__test/error/boom' });
    expect(boom.statusCode).toBe(500);
    expect(boom.json().error.code).toBe('INTERNAL');
    expect(boom.json().error.message).not.toMatch(/boom/i);

    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ status: 'ok', db: 'ok' });
    expect(health.headers['x-request-id']).toBeTruthy();

    await app.close();
    await pool.end();
  });
});
