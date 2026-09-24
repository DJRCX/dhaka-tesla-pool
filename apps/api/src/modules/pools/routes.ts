import { and, asc, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { poolMembers, pools, rideRequests, users, zones } from '../../db/schema.js';
import { registerErrorHandler } from '../../lib/error-handler.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import { tariffFromConfig } from '../fares/fare.js';
import { isCompatible } from './matching.js';
import { acceptRequest, assertPoolInvariants } from './accept.js';
import { claimSeats } from './pool.service.js';

export const driverPoolRoutes: FastifyPluginAsyncZod = async (app) => {
  registerErrorHandler(app);
  const requireDriver = app.requireRole('DRIVER');

  app.post(
    '/requests/:id/accept',
    {
      preHandler: [requireDriver],
      schema: { params: z.object({ id: z.string().uuid() }) },
    },
    async (request, reply) => {
      const deps = {
        zoneCache: app.zoneCache,
        tariff: tariffFromConfig(app.appConfig),
        detourLimitM: app.appConfig.POOL_DETOUR_LIMIT_M,
        log: request.log,
      };
      const { poolId } = await acceptRequest(app.db, request.user.sub, request.params.id, deps);
      await assertPoolInvariants(app.db, poolId);
      return reply.status(201).send({ poolId });
    },
  );
};

export const poolRoutes: FastifyPluginAsyncZod = async (app) => {
  registerErrorHandler(app);
  const requireDriver = app.requireRole('DRIVER');

  app.get(
    '/:id/candidates',
    {
      preHandler: [requireDriver],
      schema: { params: z.object({ id: z.string().uuid() }) },
    },
    async (request, reply) => {
      const [pool] = await app.db
        .select()
        .from(pools)
        .where(and(eq(pools.id, request.params.id), eq(pools.driverId, request.user.sub)))
        .limit(1);
      if (!pool) {
        throw new AppError(404, ErrorCodes.NOT_FOUND, 'Pool not found');
      }

      const members = await app.db
        .select({
          dropoffZoneId: rideRequests.dropoffZoneId,
          zoneSlug: zones.slug,
        })
        .from(poolMembers)
        .innerJoin(rideRequests, eq(poolMembers.rideRequestId, rideRequests.id))
        .leftJoin(zones, eq(rideRequests.dropoffZoneId, zones.id))
        .where(and(eq(poolMembers.poolId, pool.id), eq(poolMembers.status, 'ACTIVE')));

      const waiting = await app.db
        .select({
          id: rideRequests.id,
          seats: rideRequests.seats,
          allowPool: rideRequests.allowPool,
          pickupZoneId: rideRequests.pickupZoneId,
          dropoffZoneId: rideRequests.dropoffZoneId,
          soloFarePaisa: rideRequests.soloFarePaisa,
          passengerName: users.name,
          dropoffSlug: zones.slug,
          dropoffName: zones.name,
          createdAt: rideRequests.createdAt,
        })
        .from(rideRequests)
        .innerJoin(users, eq(rideRequests.passengerId, users.id))
        .leftJoin(zones, eq(rideRequests.dropoffZoneId, zones.id))
        .where(
          and(
            eq(rideRequests.status, 'REQUESTED'),
            eq(rideRequests.pickupZoneId, pool.pickupZoneId),
          ),
        )
        .orderBy(asc(rideRequests.createdAt));

      const detourLimitM = app.appConfig.POOL_DETOUR_LIMIT_M;
      const evaluated = waiting.map((w) => {
        const result = isCompatible({
          pool: {
            status: pool.status,
            isShared: pool.isShared,
            pickupZoneId: pool.pickupZoneId,
            seatsTaken: pool.seatsTaken,
            capacity: pool.capacity,
          },
          members: members.map((m) => ({
            dropoffZoneId: m.dropoffZoneId,
            dropoffZoneSlug: m.zoneSlug ?? undefined,
          })),
          request: {
            allowPool: w.allowPool,
            pickupZoneId: w.pickupZoneId,
            dropoffZoneId: w.dropoffZoneId,
            seats: w.seats,
          },
          distanceM: (from, to) => app.zoneCache.getDistanceM(from, to),
          detourLimitM,
        });
        return {
          id: w.id,
          passengerFirstName: w.passengerName.split(/\s+/)[0] ?? w.passengerName,
          seats: w.seats,
          allowPool: w.allowPool,
          soloFarePaisa: w.soloFarePaisa,
          dropoff: w.dropoffSlug
            ? { id: w.dropoffZoneId, slug: w.dropoffSlug, name: w.dropoffName }
            : null,
          compatible: result.ok,
          reason: result.ok ? null : result.reason,
          createdAt: w.createdAt,
        };
      });

      evaluated.sort((a, b) => Number(b.compatible) - Number(a.compatible));
      return reply.send({ candidates: evaluated });
    },
  );

  app.post(
    '/:id/members',
    {
      preHandler: [requireDriver],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.object({ rideRequestId: z.string().uuid() }),
      },
    },
    async (request, reply) => {
      const [pool] = await app.db
        .select()
        .from(pools)
        .where(and(eq(pools.id, request.params.id), eq(pools.driverId, request.user.sub)))
        .limit(1);
      if (!pool) {
        throw new AppError(404, ErrorCodes.NOT_FOUND, 'Pool not found');
      }

      const deps = {
        zoneCache: app.zoneCache,
        tariff: tariffFromConfig(app.appConfig),
        detourLimitM: app.appConfig.POOL_DETOUR_LIMIT_M,
        log: request.log,
      };

      await app.db.transaction(async (tx) => {
        await claimSeats(tx, pool.id, request.body.rideRequestId, request.user.sub, deps);
      });
      await assertPoolInvariants(app.db, pool.id);
      return reply.status(201).send({ ok: true });
    },
  );
};
