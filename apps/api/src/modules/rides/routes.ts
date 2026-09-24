import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { PaymentMethodSchema } from '@teslapool/shared';
import { registerErrorHandler } from '../../lib/error-handler.js';
import { tariffFromConfig } from '../fares/fare.js';
import {
  cancelRideForPassenger,
  createRideRequest,
  getRideForPassenger,
  listRidesForPassenger,
} from './service.js';

const createBody = z.object({
  pickupZoneId: z.number().int().positive(),
  dropoffZoneId: z.number().int().positive(),
  seats: z.number().int().min(1).max(6).default(1),
  allowPool: z.boolean().default(true),
  paymentMethod: PaymentMethodSchema,
});

export const rideRoutes: FastifyPluginAsyncZod = async (app) => {
  registerErrorHandler(app);

  const requirePassenger = app.requireRole('PASSENGER');

  app.post(
    '/',
    {
      preHandler: [requirePassenger],
      schema: { body: createBody },
    },
    async (request, reply) => {
      const tariff = tariffFromConfig(app.appConfig);
      const idempotencyKey = request.headers['idempotency-key'];
      const key =
        typeof idempotencyKey === 'string' && idempotencyKey.length > 0
          ? idempotencyKey
          : undefined;

      const result = await createRideRequest(
        app.db,
        app.zoneCache,
        tariff,
        {
          passengerId: request.user.sub,
          pickupZoneId: request.body.pickupZoneId,
          dropoffZoneId: request.body.dropoffZoneId,
          seats: request.body.seats,
          allowPool: request.body.allowPool,
          paymentMethod: request.body.paymentMethod,
          idempotencyKey: key,
        },
        request.log,
      );

      const detail = await getRideForPassenger(
        app.db,
        app.zoneCache,
        tariff,
        request.user.sub,
        result.ride.id,
      );

      return reply.status(result.created ? 201 : 200).send({ ride: detail });
    },
  );

  app.get(
    '/',
    {
      preHandler: [requirePassenger],
      schema: {
        querystring: z.object({
          status: z.enum(['active', 'history']).default('active'),
        }),
      },
    },
    async (request, reply) => {
      const tariff = tariffFromConfig(app.appConfig);
      const rides = await listRidesForPassenger(
        app.db,
        app.zoneCache,
        tariff,
        request.user.sub,
        request.query.status,
      );
      return reply.send({ rides });
    },
  );

  app.get(
    '/:id',
    {
      preHandler: [requirePassenger],
      schema: {
        params: z.object({ id: z.string().uuid() }),
      },
    },
    async (request, reply) => {
      const tariff = tariffFromConfig(app.appConfig);
      const ride = await getRideForPassenger(
        app.db,
        app.zoneCache,
        tariff,
        request.user.sub,
        request.params.id,
      );
      return reply.send({ ride });
    },
  );

  app.post(
    '/:id/cancel',
    {
      preHandler: [requirePassenger],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z
          .object({ reason: z.string().max(200).optional() })
          .optional()
          .default({}),
      },
    },
    async (request, reply) => {
      const tariff = tariffFromConfig(app.appConfig);
      const ride = await cancelRideForPassenger(
        app.db,
        app.zoneCache,
        tariff,
        request.user.sub,
        request.params.id,
        request.body?.reason,
        request.log,
      );
      return reply.send({ ride });
    },
  );
};
