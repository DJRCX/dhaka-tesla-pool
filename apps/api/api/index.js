import { buildApp } from '../dist/app.js';
import { config } from '../dist/config.js';
import { createDb, createPool } from '../dist/db/client.js';

let appPromise;

function getApp() {
  appPromise ??= (async () => {
    const pool = createPool(config.DATABASE_URL);
    const app = await buildApp({ db: createDb(pool), config });
    await app.ready();
    return app;
  })().catch((err) => {
    appPromise = undefined;
    throw err;
  });
  return appPromise;
}

export default async function handler(req, res) {
  const app = await getApp();
  app.server.emit('request', req, res);
}
