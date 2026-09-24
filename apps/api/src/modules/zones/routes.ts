import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { registerErrorHandler } from '../../lib/error-handler.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import { quoteFare, tariffFromConfig, type FareBreakdown } from '../fares/fare.js';

function toApiBreakdown(b: FareBreakdown) {
  return {
    basePaisa: b.base,
    distancePaisa: b.distance,
    discountPaisa: b.discount,
    totalPaisa: b.total,
  };
}

export const zonesRoutes: FastifyPluginAsyncZod = async (app) => {
  registerErrorHandler(app);

  app.get('/zones', async (_request, reply) => {
    return reply.send({
      zones: app.zoneCache.zones.map((z) => ({
        id: z.id,
        slug: z.slug,
        name: z.name,
        lat: z.lat,
        lng: z.lng,
      })),
    });
  });

  app.get(
    '/fares/quote',
    {
      schema: {
        querystring: z.object({
          pickup: z.coerce.number().int().positive(),
          dropoff: z.coerce.number().int().positive(),
        }),
      },
    },
    async (request, reply) => {
      const { pickup, dropoff } = request.query;
      if (pickup === dropoff) {
        throw new AppError(
          400,
          ErrorCodes.VALIDATION_ERROR,
          'Pickup and dropoff must be different zones',
        );
      }

      const from = app.zoneCache.getById(pickup);
      const to = app.zoneCache.getById(dropoff);
      if (!from || !to) {
        throw new AppError(404, ErrorCodes.NOT_FOUND, 'Unknown pickup or dropoff zone');
      }

      const distanceM = app.zoneCache.getDistanceM(pickup, dropoff);
      if (distanceM === undefined) {
        throw new AppError(404, ErrorCodes.NOT_FOUND, 'No distance between those zones');
      }

      const tariff = tariffFromConfig(app.appConfig);
      const solo = quoteFare(distanceM, 1, tariff);
      const pooled = quoteFare(distanceM, 2, tariff);

      return reply.send({
        pickup: { id: from.id, slug: from.slug, name: from.name },
        dropoff: { id: to.id, slug: to.slug, name: to.name },
        distanceM,
        solo: toApiBreakdown(solo),
        pooled: toApiBreakdown(pooled),
      });
    },
  );
};
