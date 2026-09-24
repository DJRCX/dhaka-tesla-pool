import { randomUUID } from 'node:crypto';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { sql } from 'drizzle-orm';
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { ZodError } from 'zod';
import type { AppConfig } from './config.js';
import type { Db } from './db/client.js';
import { registerErrorHandler } from './lib/error-handler.js';
import { AppError, ErrorCodes } from './lib/errors.js';
import { tariffFromConfig } from './modules/fares/fare.js';
import { ZoneCache } from './modules/zones/cache.js';

export type BuildAppOptions = {
  db: Db;
  config: AppConfig;
  logger?: boolean | object;
};

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
    appConfig: AppConfig;
    zoneCache: ZoneCache;
  }
}

function getRequestId(request: FastifyRequest): string {
  const existing = request.id;
  if (typeof existing === 'string' && existing.length > 0) return existing;
  return randomUUID();
}

export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  // Fail fast if tariff would break the integer-paisa invariant
  tariffFromConfig(opts.config);

  const isDev = process.env.NODE_ENV !== 'production';
  const app = Fastify({
    logger:
      opts.logger ??
      ({
        level: opts.config.LOG_LEVEL,
        redact: ['req.headers.cookie', 'req.headers.authorization', '*.password'],
        transport: isDev
          ? {
              target: 'pino-pretty',
              options: { colorize: true, translateTime: 'HH:MM:ss' },
            }
          : undefined,
      } as object),
    genReqId: (req) => {
      const header = req.headers['x-request-id'];
      if (typeof header === 'string' && header.length > 0) return header;
      return randomUUID();
    },
    requestIdHeader: 'x-request-id',
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.decorate('db', opts.db);
  app.decorate('appConfig', opts.config);

  const zoneCache = await ZoneCache.load(opts.db);
  app.decorate('zoneCache', zoneCache);

  await app.register(helmet, { global: true });
  await app.register(cookie);
  await app.register(rateLimit, {
    global: false,
  });

  registerErrorHandler(app);

  const { default: authPlugin } = await import('./modules/auth/session.js');
  await app.register(authPlugin);

  const { authRoutes } = await import('./modules/auth/routes.js');
  const { driverProbeRoutes } = await import('./modules/driver/probe.js');
  const { zonesRoutes } = await import('./modules/zones/routes.js');
  const { rideRoutes } = await import('./modules/rides/routes.js');
  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(driverProbeRoutes, { prefix: '/api/v1/driver' });
  await app.register(zonesRoutes, { prefix: '/api/v1' });
  await app.register(rideRoutes, { prefix: '/api/v1/rides' });

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', getRequestId(request));
  });

  app.get('/health', async (_request, reply) => {
    try {
      const result = await Promise.race([
        opts.db.execute(sql`SELECT 1`),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('db ping timeout')), 1000),
        ),
      ]);
      void result;
      return reply.status(200).send({ status: 'ok', db: 'ok' });
    } catch {
      return reply.status(503).send({ status: 'degraded', db: 'down' });
    }
  });

  // Dev/test-only probe routes for the error-handler suite
  if (process.env.NODE_ENV !== 'production') {
    app.get('/__test/error/:kind', async (request) => {
      const kind = (request.params as { kind: string }).kind;
      if (kind === 'app') {
        throw new AppError(409, ErrorCodes.POOL_FULL, 'pool full for test');
      }
      if (kind === 'zod') {
        throw new ZodError([
          {
            code: 'custom',
            path: ['email'],
            message: 'Invalid email',
          },
        ]);
      }
      if (kind === 'pg-mapped') {
        const e = Object.assign(new Error('dup'), {
          code: '23505',
          constraint: 'one_active_request_per_passenger',
        });
        throw e;
      }
      if (kind === 'pg-unknown') {
        const e = Object.assign(new Error('weird'), {
          code: '23505',
          constraint: 'some_unknown_constraint',
        });
        throw e;
      }
      throw new Error('boom');
    });
  }

  return app;
}

export type { FastifyReply, FastifyRequest };
