import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  driverProfiles,
  poolMembers,
  pools,
  rideRequests,
  users,
  vehicles,
  zones,
} from '../../db/schema.js';
import { registerErrorHandler } from '../../lib/error-handler.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import {
  ACTIVE_POOL,
  arrivePool,
  cancelPool,
  completePool,
  driverHasActivePool,
  nextPoolActions,
  startPool,
} from '../pools/lifecycle.js';

export const driverFlowRoutes: FastifyPluginAsyncZod = async (app) => {
  registerErrorHandler(app);
  const requireDriver = app.requireRole('DRIVER');

  app.patch(
    '/status',
    {
      preHandler: [requireDriver],
      schema: {
        body: z.object({
          isOnline: z.boolean(),
          currentZoneId: z.number().int().positive().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { isOnline, currentZoneId } = request.body;
      if (isOnline && currentZoneId == null) {
        throw new AppError(
          400,
          ErrorCodes.VALIDATION_ERROR,
          'currentZoneId is required when going online',
        );
      }
      if (isOnline && currentZoneId != null && !app.zoneCache.getById(currentZoneId)) {
        throw new AppError(404, ErrorCodes.NOT_FOUND, 'Unknown zone');
      }
      if (!isOnline && (await driverHasActivePool(app.db, request.user.sub))) {
        throw new AppError(
          409,
          ErrorCodes.ACTIVE_POOL_EXISTS,
          'Finish or cancel your active pool before going offline.',
        );
      }

      const [updated] = await app.db
        .update(driverProfiles)
        .set({
          isOnline,
          currentZoneId: isOnline ? currentZoneId! : null,
          updatedAt: new Date(),
        })
        .where(eq(driverProfiles.userId, request.user.sub))
        .returning();
      if (!updated) {
        throw new AppError(404, ErrorCodes.NOT_FOUND, 'Driver profile not found');
      }

      return reply.send({
        isOnline: updated.isOnline,
        currentZoneId: updated.currentZoneId,
      });
    },
  );

  app.get(
    '/requests',
    {
      preHandler: [requireDriver],
    },
    async (request, reply) => {
      const [profile] = await app.db
        .select()
        .from(driverProfiles)
        .where(eq(driverProfiles.userId, request.user.sub))
        .limit(1);
      if (!profile?.isOnline || profile.currentZoneId == null) {
        return reply.send({ requests: [] });
      }

      const rows = await app.db
        .select({
          id: rideRequests.id,
          seats: rideRequests.seats,
          allowPool: rideRequests.allowPool,
          soloFarePaisa: rideRequests.soloFarePaisa,
          passengerName: users.name,
          dropoffId: zones.id,
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
            eq(rideRequests.pickupZoneId, profile.currentZoneId),
          ),
        )
        .orderBy(asc(rideRequests.createdAt));

      return reply.send({
        requests: rows.map((r) => ({
          id: r.id,
          passengerFirstName: r.passengerName.split(/\s+/)[0] ?? r.passengerName,
          seats: r.seats,
          allowPool: r.allowPool,
          estimatedFarePaisa: r.soloFarePaisa,
          dropoff: r.dropoffId
            ? { id: r.dropoffId, slug: r.dropoffSlug, name: r.dropoffName }
            : null,
          createdAt: r.createdAt,
        })),
      });
    },
  );

  app.get(
    '/pools/current',
    {
      preHandler: [requireDriver],
    },
    async (request, reply) => {
      const [pool] = await app.db
        .select()
        .from(pools)
        .where(and(eq(pools.driverId, request.user.sub), inArray(pools.status, ACTIVE_POOL)))
        .orderBy(desc(pools.createdAt))
        .limit(1);
      if (!pool) {
        return reply.send({ pool: null });
      }

      const [vehicle] = await app.db
        .select()
        .from(vehicles)
        .where(eq(vehicles.id, pool.vehicleId))
        .limit(1);

      const members = await app.db
        .select({
          rideRequestId: poolMembers.rideRequestId,
          seats: poolMembers.seats,
          farePaisa: poolMembers.farePaisa,
          baseFarePaisa: poolMembers.baseFarePaisa,
          distanceChargePaisa: poolMembers.distanceChargePaisa,
          poolDiscountPaisa: poolMembers.poolDiscountPaisa,
          passengerName: users.name,
          dropoffZoneId: rideRequests.dropoffZoneId,
          paymentMethod: rideRequests.paymentMethod,
          requestStatus: rideRequests.status,
          dropoffSlug: zones.slug,
          dropoffName: zones.name,
        })
        .from(poolMembers)
        .innerJoin(rideRequests, eq(poolMembers.rideRequestId, rideRequests.id))
        .innerJoin(users, eq(rideRequests.passengerId, users.id))
        .leftJoin(zones, eq(rideRequests.dropoffZoneId, zones.id))
        .where(and(eq(poolMembers.poolId, pool.id), eq(poolMembers.status, 'ACTIVE')));

      return reply.send({
        pool: {
          id: pool.id,
          status: pool.status,
          pickupZoneId: pool.pickupZoneId,
          isShared: pool.isShared,
          capacity: pool.capacity,
          seatsTaken: pool.seatsTaken,
          seatsRemaining: pool.capacity - pool.seatsTaken,
          vehicle: vehicle
            ? {
                id: vehicle.id,
                name: vehicle.name,
                plate: vehicle.plate,
                capacity: vehicle.capacity,
              }
            : null,
          nextActions: nextPoolActions(pool.status),
          members: members.map((m) => ({
            rideRequestId: m.rideRequestId,
            passengerName: m.passengerName,
            seats: m.seats,
            paymentMethod: m.paymentMethod,
            requestStatus: m.requestStatus,
            dropoff: m.dropoffSlug
              ? { id: m.dropoffZoneId, slug: m.dropoffSlug, name: m.dropoffName }
              : null,
            fare: {
              basePaisa: m.baseFarePaisa,
              distancePaisa: m.distanceChargePaisa,
              discountPaisa: m.poolDiscountPaisa,
              totalPaisa:
                m.farePaisa ??
                m.baseFarePaisa + m.distanceChargePaisa - m.poolDiscountPaisa,
            },
          })),
          createdAt: pool.createdAt,
        },
      });
    },
  );

  app.get(
    '/pools',
    {
      preHandler: [requireDriver],
    },
    async (request, reply) => {
      const history = await app.db
        .select()
        .from(pools)
        .where(eq(pools.driverId, request.user.sub))
        .orderBy(desc(pools.createdAt))
        .limit(50);

      const out = [];
      for (const pool of history) {
        const pickup = app.zoneCache.getById(pool.pickupZoneId);
        const memberRows = await app.db
          .select({
            passengerName: users.name,
            seats: poolMembers.seats,
            paymentMethod: rideRequests.paymentMethod,
            farePaisa: poolMembers.farePaisa,
            base: poolMembers.baseFarePaisa,
            distance: poolMembers.distanceChargePaisa,
            discount: poolMembers.poolDiscountPaisa,
            dropoffId: zones.id,
            dropoffSlug: zones.slug,
            dropoffName: zones.name,
            memberStatus: poolMembers.status,
            joinedAt: poolMembers.joinedAt,
          })
          .from(poolMembers)
          .innerJoin(rideRequests, eq(poolMembers.rideRequestId, rideRequests.id))
          .innerJoin(users, eq(rideRequests.passengerId, users.id))
          .leftJoin(zones, eq(rideRequests.dropoffZoneId, zones.id))
          .where(eq(poolMembers.poolId, pool.id))
          .orderBy(asc(poolMembers.joinedAt));

        const totalCollectedPaisa = memberRows.reduce(
          (s, r) => s + (r.farePaisa ?? r.base + r.distance - r.discount),
          0,
        );

        out.push({
          id: pool.id,
          status: pool.status,
          seatsTaken: pool.seatsTaken,
          capacity: pool.capacity,
          totalCollectedPaisa,
          createdAt: pool.createdAt,
          completedAt: pool.completedAt,
          pickup: pickup
            ? { id: pickup.id, slug: pickup.slug, name: pickup.name }
            : null,
          members: memberRows.map((m) => ({
            passengerName: m.passengerName,
            seats: m.seats,
            paymentMethod: m.paymentMethod,
            status: m.memberStatus,
            farePaisa: m.farePaisa ?? m.base + m.distance - m.discount,
            dropoff: m.dropoffId
              ? { id: m.dropoffId, slug: m.dropoffSlug, name: m.dropoffName }
              : null,
            joinedAt: m.joinedAt,
          })),
        });
      }
      return reply.send({ pools: out });
    },
  );
};

export const poolLifecycleRoutes: FastifyPluginAsyncZod = async (app) => {
  registerErrorHandler(app);
  const requireDriver = app.requireRole('DRIVER');

  app.post(
    '/:id/arrive',
    {
      preHandler: [requireDriver],
      schema: { params: z.object({ id: z.string().uuid() }) },
    },
    async (request, reply) => {
      await arrivePool(app.db, request.user.sub, request.params.id, request.log);
      return reply.send({ ok: true });
    },
  );
  app.post(
    '/:id/start',
    {
      preHandler: [requireDriver],
      schema: { params: z.object({ id: z.string().uuid() }) },
    },
    async (request, reply) => {
      await startPool(app.db, request.user.sub, request.params.id, request.log);
      return reply.send({ ok: true });
    },
  );
  app.post(
    '/:id/complete',
    {
      preHandler: [requireDriver],
      schema: { params: z.object({ id: z.string().uuid() }) },
    },
    async (request, reply) => {
      await completePool(app.db, request.user.sub, request.params.id, request.log);
      return reply.send({ ok: true });
    },
  );
  app.post(
    '/:id/cancel',
    {
      preHandler: [requireDriver],
      schema: { params: z.object({ id: z.string().uuid() }) },
    },
    async (request, reply) => {
      await cancelPool(app.db, request.user.sub, request.params.id, request.log);
      return reply.send({ ok: true });
    },
  );
};
