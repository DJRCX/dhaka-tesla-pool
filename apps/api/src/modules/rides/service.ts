import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { PaymentMethod, RequestStatus } from '@teslapool/shared';
import type { Db } from '../../db/client.js';
import {
  poolMembers,
  pools,
  rideEvents,
  rideRequests,
  users,
  vehicles,
  wallets,
} from '../../db/schema.js';
import { recordEvent } from '../../lib/events.js';
import { AppError, ErrorCodes, extractPgError, mapPostgresError } from '../../lib/errors.js';
import {
  ACTIVE_REQUEST_STATUSES,
  assertTransition,
  isActiveRequestStatus,
} from '../../lib/state-machine.js';
import { quoteFare, tariffFromConfig, type FareBreakdown, type Tariff } from '../fares/fare.js';
import type { ZoneCache } from '../zones/cache.js';
import { tryAutoMatch } from '../pools/pool.service.js';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export type CreateRideInput = {
  passengerId: string;
  pickupZoneId: number;
  dropoffZoneId: number;
  seats: number;
  allowPool: boolean;
  paymentMethod: PaymentMethod;
  idempotencyKey?: string;
};

function toApiFare(b: FareBreakdown, isFinal: boolean) {
  return {
    basePaisa: b.base,
    distancePaisa: b.distance,
    discountPaisa: b.discount,
    totalPaisa: b.total,
    isFinal,
  };
}

function mapInsertError(err: unknown): never {
  const pg = extractPgError(err);
  if (pg) {
    const mapped = mapPostgresError(pg);
    if (mapped) throw mapped;
  }
  throw err;
}

export async function createRideRequest(
  db: Db,
  zoneCache: ZoneCache,
  tariff: Tariff,
  input: CreateRideInput,
  log?: { info: (obj: object, msg?: string) => void },
  detourLimitM = 3_000,
) {
  if (input.pickupZoneId === input.dropoffZoneId) {
    throw new AppError(
      400,
      ErrorCodes.VALIDATION_ERROR,
      'Pickup and dropoff must be different zones',
    );
  }
  const pickup = zoneCache.getById(input.pickupZoneId);
  const dropoff = zoneCache.getById(input.dropoffZoneId);
  if (!pickup || !dropoff) {
    throw new AppError(404, ErrorCodes.NOT_FOUND, 'Unknown pickup or dropoff zone');
  }

  const distanceM = zoneCache.getDistanceM(input.pickupZoneId, input.dropoffZoneId);
  if (distanceM === undefined) {
    throw new AppError(404, ErrorCodes.NOT_FOUND, 'No distance between those zones');
  }

  const solo = quoteFare(distanceM, 1, tariff);

  if (input.idempotencyKey) {
    const [existing] = await db
      .select()
      .from(rideRequests)
      .where(
        and(
          eq(rideRequests.passengerId, input.passengerId),
          eq(rideRequests.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (existing) {
      return { ride: existing, created: false as const };
    }
  }

  try {
    const created = await db.transaction(async (tx) => {
      if (input.paymentMethod === 'WALLET') {
        const [wallet] = await tx
          .select()
          .from(wallets)
          .where(eq(wallets.userId, input.passengerId))
          .for('update')
          .limit(1);
        if (!wallet || wallet.balancePaisa < solo.total) {
          throw new AppError(
            422,
            ErrorCodes.INSUFFICIENT_BALANCE,
            'Your TeslaPay balance is too low for this ride.',
          );
        }
      }

      const [row] = await tx
        .insert(rideRequests)
        .values({
          passengerId: input.passengerId,
          pickupZoneId: input.pickupZoneId,
          dropoffZoneId: input.dropoffZoneId,
          seats: input.seats,
          allowPool: input.allowPool,
          paymentMethod: input.paymentMethod,
          distanceM,
          soloFarePaisa: solo.total,
          status: 'REQUESTED',
          idempotencyKey: input.idempotencyKey ?? null,
        })
        .returning();
      if (!row) throw new AppError(500, ErrorCodes.INTERNAL, 'Failed to create ride request');

      await recordEvent(
        tx,
        {
          rideRequestId: row.id,
          actorUserId: input.passengerId,
          type: 'REQUEST_CREATED',
          toStatus: 'REQUESTED',
          data: {
            pickupZoneId: input.pickupZoneId,
            dropoffZoneId: input.dropoffZoneId,
            soloFarePaisa: solo.total,
            paymentMethod: input.paymentMethod,
          },
        },
        log,
      );

      await tryAutoMatch(
        tx,
        row.id,
        input.passengerId,
        {
          pickupZoneId: row.pickupZoneId,
          seats: row.seats,
          allowPool: row.allowPool,
        },
        {
          zoneCache,
          tariff,
          detourLimitM,
          log,
        },
      );

      const [fresh] = await tx
        .select()
        .from(rideRequests)
        .where(eq(rideRequests.id, row.id))
        .limit(1);
      return fresh ?? row;
    });

    return { ride: created, created: true as const };
  } catch (err) {
    if (err instanceof AppError) throw err;
    mapInsertError(err);
  }
}

async function loadActiveMembership(tx: Tx | Db, rideRequestId: string) {
  const [member] = await tx
    .select({
      id: poolMembers.id,
      poolId: poolMembers.poolId,
      seats: poolMembers.seats,
      baseFarePaisa: poolMembers.baseFarePaisa,
      distanceChargePaisa: poolMembers.distanceChargePaisa,
      poolDiscountPaisa: poolMembers.poolDiscountPaisa,
      farePaisa: poolMembers.farePaisa,
      status: poolMembers.status,
    })
    .from(poolMembers)
    .where(
      and(eq(poolMembers.rideRequestId, rideRequestId), eq(poolMembers.status, 'ACTIVE')),
    )
    .limit(1);
  return member ?? null;
}

export async function getRideForPassenger(
  db: Db,
  zoneCache: ZoneCache,
  tariff: Tariff,
  passengerId: string,
  rideId: string,
) {
  const [ride] = await db
    .select()
    .from(rideRequests)
    .where(and(eq(rideRequests.id, rideId), eq(rideRequests.passengerId, passengerId)))
    .limit(1);
  if (!ride) {
    throw new AppError(404, ErrorCodes.NOT_FOUND, 'Ride not found');
  }
  return serializeRide(db, zoneCache, tariff, ride);
}

export async function listRidesForPassenger(
  db: Db,
  zoneCache: ZoneCache,
  tariff: Tariff,
  passengerId: string,
  statusFilter: 'active' | 'history',
) {
  const rows = await db
    .select()
    .from(rideRequests)
    .where(
      and(
        eq(rideRequests.passengerId, passengerId),
        statusFilter === 'active'
          ? inArray(rideRequests.status, [...ACTIVE_REQUEST_STATUSES])
          : inArray(rideRequests.status, ['COMPLETED', 'CANCELLED']),
      ),
    )
    .orderBy(desc(rideRequests.createdAt));

  const out = [];
  for (const ride of rows) {
    out.push(await serializeRide(db, zoneCache, tariff, ride));
  }
  return out;
}

async function serializeRide(
  db: Db,
  zoneCache: ZoneCache,
  tariff: Tariff,
  ride: typeof rideRequests.$inferSelect,
) {
  const pickup = zoneCache.getById(ride.pickupZoneId);
  const dropoff = zoneCache.getById(ride.dropoffZoneId);
  const membership = await loadActiveMembership(db, ride.id);

  let fare = toApiFare(quoteFare(ride.distanceM, 1, tariff), ride.status === 'COMPLETED');
  let poolInfo: {
    driverName: string;
    vehicleName: string;
    coRiderCount: number;
    status: string;
  } | null = null;

  if (membership) {
    fare = {
      basePaisa: membership.baseFarePaisa,
      distancePaisa: membership.distanceChargePaisa,
      discountPaisa: membership.poolDiscountPaisa,
      totalPaisa: membership.farePaisa ?? membership.baseFarePaisa + membership.distanceChargePaisa - membership.poolDiscountPaisa,
      isFinal: ride.status === 'STARTED' || ride.status === 'COMPLETED',
    };

    const [pool] = await db.select().from(pools).where(eq(pools.id, membership.poolId)).limit(1);
    if (pool) {
      const [driver] = await db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, pool.driverId))
        .limit(1);
      const [vehicle] = await db
        .select({ name: vehicles.name })
        .from(vehicles)
        .where(eq(vehicles.id, pool.vehicleId))
        .limit(1);
      const activeMembers = await db
        .select({ id: poolMembers.id })
        .from(poolMembers)
        .where(and(eq(poolMembers.poolId, pool.id), eq(poolMembers.status, 'ACTIVE')));
      poolInfo = {
        driverName: driver?.name ?? 'Driver',
        vehicleName: vehicle?.name ?? 'Tesla',
        coRiderCount: Math.max(0, activeMembers.length - 1),
        status: pool.status,
      };
    }
  }

  const events = await db
    .select({
      id: rideEvents.id,
      type: rideEvents.type,
      fromStatus: rideEvents.fromStatus,
      toStatus: rideEvents.toStatus,
      createdAt: rideEvents.createdAt,
    })
    .from(rideEvents)
    .where(eq(rideEvents.rideRequestId, ride.id))
    .orderBy(asc(rideEvents.id));

  return {
    id: ride.id,
    status: ride.status,
    pickup: pickup
      ? { id: pickup.id, slug: pickup.slug, name: pickup.name }
      : { id: ride.pickupZoneId, slug: '', name: '' },
    dropoff: dropoff
      ? { id: dropoff.id, slug: dropoff.slug, name: dropoff.name }
      : { id: ride.dropoffZoneId, slug: '', name: '' },
    seats: ride.seats,
    allowPool: ride.allowPool,
    paymentMethod: ride.paymentMethod,
    distanceM: ride.distanceM,
    soloFarePaisa: ride.soloFarePaisa,
    finalFarePaisa: ride.finalFarePaisa,
    fare,
    pool: poolInfo,
    events,
    createdAt: ride.createdAt,
  };
}

/**
 * Cancel own ride. Locks the request; if in a pool, locks the pool first (DESIGN §9.1),
 * marks membership LEFT, decrements seats, recomputes remaining fares, and auto-cancels
 * an empty pool. Pool join/leave race coverage completes in Phase 7.
 */
export async function cancelRideForPassenger(
  db: Db,
  zoneCache: ZoneCache,
  tariff: Tariff,
  passengerId: string,
  rideId: string,
  reason?: string,
  log?: { info: (obj: object, msg?: string) => void },
) {
  await db.transaction(async (tx) => {
    const [ride] = await tx
      .select()
      .from(rideRequests)
      .where(and(eq(rideRequests.id, rideId), eq(rideRequests.passengerId, passengerId)))
      .for('update')
      .limit(1);
    if (!ride) {
      throw new AppError(404, ErrorCodes.NOT_FOUND, 'Ride not found');
    }

    assertTransition('request', ride.status, 'CANCELLED');

    const membership = await loadActiveMembership(tx, ride.id);
    if (membership) {
      // Lock pool first (DESIGN §9.1), then mutate membership
      const [pool] = await tx
        .select()
        .from(pools)
        .where(eq(pools.id, membership.poolId))
        .for('update')
        .limit(1);
      if (!pool) {
        throw new AppError(500, ErrorCodes.INTERNAL, 'Pool missing for membership');
      }

      await tx
        .update(poolMembers)
        .set({ status: 'LEFT', leftAt: new Date() })
        .where(eq(poolMembers.id, membership.id));

      const newSeats = Math.max(0, pool.seatsTaken - membership.seats);
      await tx
        .update(pools)
        .set({ seatsTaken: newSeats, updatedAt: new Date() })
        .where(eq(pools.id, pool.id));

      await recordEvent(
        tx,
        {
          rideRequestId: ride.id,
          poolId: pool.id,
          actorUserId: passengerId,
          type: 'MEMBER_LEFT',
          data: { reason: reason ?? null },
        },
        log,
      );

      const remaining = await tx
        .select()
        .from(poolMembers)
        .where(and(eq(poolMembers.poolId, pool.id), eq(poolMembers.status, 'ACTIVE')));

      if (remaining.length === 0) {
        assertTransition('pool', pool.status, 'CANCELLED');
        await tx
          .update(pools)
          .set({ status: 'CANCELLED', updatedAt: new Date() })
          .where(eq(pools.id, pool.id));
        await recordEvent(
          tx,
          {
            poolId: pool.id,
            actorUserId: passengerId,
            type: 'POOL_STATUS_CHANGED',
            fromStatus: pool.status,
            toStatus: 'CANCELLED',
          },
          log,
        );
      } else {
        // Recompute fares for remaining members
        for (const m of remaining) {
          const [req] = await tx
            .select()
            .from(rideRequests)
            .where(eq(rideRequests.id, m.rideRequestId))
            .limit(1);
          if (!req) continue;
          const breakdown = quoteFare(req.distanceM, remaining.length, tariff);
          await tx
            .update(poolMembers)
            .set({
              baseFarePaisa: breakdown.base,
              distanceChargePaisa: breakdown.distance,
              poolDiscountPaisa: breakdown.discount,
            })
            .where(eq(poolMembers.id, m.id));
          await recordEvent(
            tx,
            {
              rideRequestId: req.id,
              poolId: pool.id,
              type: 'FARE_RECALCULATED',
              data: breakdown,
            },
            log,
          );
        }
      }
    }

    await tx
      .update(rideRequests)
      .set({ status: 'CANCELLED', cancelledAt: new Date() })
      .where(eq(rideRequests.id, ride.id));

    await recordEvent(
      tx,
      {
        rideRequestId: ride.id,
        actorUserId: passengerId,
        type: 'REQUEST_STATUS_CHANGED',
        fromStatus: ride.status,
        toStatus: 'CANCELLED',
        data: { reason: reason ?? null },
      },
      log,
    );
  });

  return getRideForPassenger(db, zoneCache, tariff, passengerId, rideId);
}

export { tariffFromConfig, isActiveRequestStatus };
export type { RequestStatus };
