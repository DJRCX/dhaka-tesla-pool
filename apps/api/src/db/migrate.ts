import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { loadConfig } from '../config.js';
import { createDb, createPool } from './client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function runMigrations(databaseUrl?: string): Promise<void> {
  const config = loadConfig();
  const url = databaseUrl ?? config.DATABASE_URL;
  const pool = createPool(url);
  const db = createDb(pool);
  try {
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../drizzle') });
    console.log('Migrations applied successfully.');
  } finally {
    await pool.end();
  }
}

const isDirectRun = process.argv[1]
  ? fileURLToPath(import.meta.url) === resolve(process.argv[1])
  : false;

if (isDirectRun) {
  runMigrations().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
