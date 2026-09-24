import { sql } from 'drizzle-orm';
import { beforeAll, beforeEach } from 'vitest';
import { loadConfig } from '../src/config.js';
import { createDb, createPool, type Db } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';

let pool: ReturnType<typeof createPool>;
export let testDb: Db;
export let testDatabaseUrl: string;

beforeAll(async () => {
  const config = loadConfig();
  testDatabaseUrl = config.TEST_DATABASE_URL ?? config.DATABASE_URL.replace(/\/[^/]+$/, '/teslapool_test');
  await runMigrations(testDatabaseUrl);
  pool = createPool(testDatabaseUrl);
  testDb = createDb(pool);
});

beforeEach(async () => {
  await testDb.execute(sql`
    TRUNCATE TABLE
      wallet_transactions,
      ride_events,
      pool_members,
      pools,
      ride_requests,
      wallets,
      vehicles,
      driver_profiles,
      users,
      zone_distances,
      zones
    RESTART IDENTITY CASCADE
  `);
});
