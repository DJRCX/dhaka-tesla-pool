import { createDb, createPool } from './db/client.js';
import { config } from './config.js';
import { buildApp } from './app.js';

async function main() {
  const pool = createPool(config.DATABASE_URL);
  const db = createDb(pool);
  const app = await buildApp({ db, config });

  const close = async () => {
    await app.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGINT', close);
  process.on('SIGTERM', close);

  await app.listen({ port: config.API_PORT, host: '0.0.0.0' });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
