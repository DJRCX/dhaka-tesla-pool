import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { registerErrorHandler } from '../../lib/error-handler.js';

/** Temporary driver-only probe used by auth role-guard tests until Phase 8. */
export const driverProbeRoutes: FastifyPluginAsyncZod = async (app) => {
  registerErrorHandler(app);

  app.get(
    '/ping',
    {
      preHandler: [app.requireRole('DRIVER')],
    },
    async () => ({ ok: true }),
  );
};
