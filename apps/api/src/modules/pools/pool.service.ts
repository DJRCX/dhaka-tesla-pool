import { and, asc, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import {
  poolMembers,
  pools,
  rideRequests,
  zones,
} from '../../db/schema.js';
import { recordEvent } from '../../lib/events.js';
import { AppError, ErrorCodes, extractPgError, mapPostgresError } from '../../lib/errors.js';
import { assertTransition } from '../../lib/state-machine.js';
import { quoteFare, type Tariff } from '../fares/fare.js';
import type { ZoneCache } from '../zones/cache.js';
import { isCompatible } from './matching.js';

export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export type ClaimSeatsDeps = {
  zoneCache: ZoneCache;
  tariff: Tariff;
  detourLimitM: number;
  log?: { info: (obj: object, msg?: string) => void };
};

function mapPg(err: unknown): never {
  if (err instanceof AppError) throw err;
  const pg = extractPgError(err);
  if (pg) {
    const mapped = mapPostgresError(pg);
    if (mapped) throw mapped;
  }
  throw err;
}

/**
 * Claim seats for a REQUESTED ride into a pool. Caller must run inside a transaction.
 * Locks the pool row first (DESIGN §9.1), then the request.
 */
export async function claimSeats(
  tx: Tx,
  poolId: string,
  requestId: string,
  actorUserId: string,
  deps: ClaimSeatsDeps,
): Promise<void> {
  const [pool] = await tx
    .select()
    .from(pools)
    .where(eq(pools.id, poolId))
    .for('update')
    .limit(1);
  if (!pool) {
    throw new AppError(404, ErrorCodes.NOT_FOUND, 'Pool not found');
  }

  const activeMembers = await tx
    .select({
      memberId: poolMembers.id,
      rideRequestId: poolMembers.rideRequestId,
      seats: poolMembers.seats,
      dropoffZoneId: rideRequests.dropoffZoneId,
      distanceM: rideRequests.distanceM,
      zoneSlug: zones.slug,
    })
    .from(poolMembers)
    .innerJoin(rideRequests, eq(poolMembers.rideRequestId, rideRequests.id))
    .leftJoin(zones, eq(rideRequests.dropoffZoneId, zones.id))
    .where(and(eq(poolMembers.poolId, poolId), eq(poolMembers.status, 'ACTIVE')));

  const [request] = await tx
    .select()
    .from(rideRequests)
    .where(eq(rideRequests.id, requestId))
    .for('update')
    .limit(1);
  if (!request) {
    throw new AppError(404, ErrorCodes.NOT_FOUND, 'Ride request not found');
  }
  if (request.status !== 'REQUESTED') {
    throw new AppError(
      409,
      ErrorCodes.REQUEST_ALREADY_MATCHED,
      'This ride is already in a pool.',
    );
  }

  const compatibility = isCompatible({
    pool: {
      status: pool.status,
      isShared: pool.isShared,
      pickupZoneId: pool.pickupZoneId,
      seatsTaken: pool.seatsTaken,
      capacity: pool.capacity,
    },
    members: activeMembers.map((m) => ({
      dropoffZoneId: m.dropoffZoneId,
      dropoffZoneSlug: m.zoneSlug ?? undefined,
    })),
    request: {
      allowPool: request.allowPool,
      pickupZoneId: request.pickupZoneId,
      dropoffZoneId: request.dropoffZoneId,
      seats: request.seats,
    },
    distanceM: (from, to) => deps.zoneCache.getDistanceM(from, to),
    detourLimitM: deps.detourLimitM,
  });

  if (!compatibility.ok) {
    if (compatibility.reason === 'NO_SEATS') {
      throw new AppError(
        409,
        ErrorCodes.POOL_FULL,
        "Bullet just filled up. You're still in the queue for the next Tesla.",
        { reason: compatibility.reason },
      );
    }
    throw new AppError(
      409,
      ErrorCodes.NOT_COMPATIBLE,
      'This request is not compatible with the pool.',
      { reason: compatibility.reason },
    );
  }

  const newSeatsTaken = pool.seatsTaken + request.seats;
  try {
    await tx
      .update(pools)
      .set({ seatsTaken: newSeatsTaken, updatedAt: new Date() })
      .where(eq(pools.id, poolId));
  } catch (err) {
    mapPg(err);
  }

  const riderCount = activeMembers.length + 1;
  const joiningFare = quoteFare(request.distanceM, riderCount, deps.tariff);

  try {
    await tx.insert(poolMembers).values({
      poolId,
      rideRequestId: request.id,
      seats: request.seats,
      status: 'ACTIVE',
      baseFarePaisa: joiningFare.base,
      distanceChargePaisa: joiningFare.distance,
      poolDiscountPaisa: joiningFare.discount,
    });
  } catch (err) {
    mapPg(err);
  }

  assertTransition('request', 'REQUESTED', 'MATCHED');
  const matched = await tx
    .update(rideRequests)
    .set({ status: 'MATCHED' })
    .where(and(eq(rideRequests.id, request.id), eq(rideRequests.status, 'REQUESTED')))
    .returning({ id: rideRequests.id });
  if (matched.length === 0) {
    throw new AppError(
      409,
      ErrorCodes.REQUEST_ALREADY_MATCHED,
      'This ride is already in a pool.',
    );
  }

  await recordEvent(
    tx,
    {
      rideRequestId: request.id,
      poolId,
      actorUserId: actorUserId,
      type: 'MEMBER_JOINED',
      toStatus: 'MATCHED',
      data: { seats: request.seats },
    },
    deps.log,
  );
  await recordEvent(
    tx,
    {
      rideRequestId: request.id,
      poolId,
      actorUserId: actorUserId,
      type: 'REQUEST_STATUS_CHANGED',
      fromStatus: 'REQUESTED',
      toStatus: 'MATCHED',
    },
    deps.log,
  );

  if (pool.status === 'DRIVER_ARRIVED') {
    assertTransition('request', 'MATCHED', 'DRIVER_ARRIVED');
    await tx
      .update(rideRequests)
      .set({ status: 'DRIVER_ARRIVED' })
      .where(eq(rideRequests.id, request.id));
    await recordEvent(
      tx,
      {
        rideRequestId: request.id,
        poolId,
        actorUserId: actorUserId,
        type: 'REQUEST_STATUS_CHANGED',
        fromStatus: 'MATCHED',
        toStatus: 'DRIVER_ARRIVED',
      },
      deps.log,
    );
  }

  // Recompute fares for every active member (including the new one)
  const allActive = await tx
    .select({
      memberId: poolMembers.id,
      rideRequestId: poolMembers.rideRequestId,
      distanceM: rideRequests.distanceM,
      baseFarePaisa: poolMembers.baseFarePaisa,
      distanceChargePaisa: poolMembers.distanceChargePaisa,
      poolDiscountPaisa: poolMembers.poolDiscountPaisa,
    })
    .from(poolMembers)
    .innerJoin(rideRequests, eq(poolMembers.rideRequestId, rideRequests.id))
    .where(and(eq(poolMembers.poolId, poolId), eq(poolMembers.status, 'ACTIVE')));

  for (const m of allActive) {
    const breakdown = quoteFare(m.distanceM, allActive.length, deps.tariff);
    const changed =
      m.baseFarePaisa !== breakdown.base ||
      m.distanceChargePaisa !== breakdown.distance ||
      m.poolDiscountPaisa !== breakdown.discount;
    if (!changed) continue;
    await tx
      .update(poolMembers)
      .set({
        baseFarePaisa: breakdown.base,
        distanceChargePaisa: breakdown.distance,
        poolDiscountPaisa: breakdown.discount,
      })
      .where(eq(poolMembers.id, m.memberId));
    await recordEvent(
      tx,
      {
        rideRequestId: m.rideRequestId,
        poolId,
        type: 'FARE_RECALCULATED',
        data: breakdown,
      },
      deps.log,
    );
  }
}

export async function findAutoMatchCandidates(
  tx: Tx,
  request: {
    pickupZoneId: number;
    seats: number;
    allowPool: boolean;
  },
): Promise<Array<{ id: string }>> {
  if (!request.allowPool) return [];
  return tx
    .select({ id: pools.id })
    .from(pools)
    .where(
      and(
        eq(pools.pickupZoneId, request.pickupZoneId),
        eq(pools.isShared, true),
        sql`${pools.status} IN ('ACCEPTED','DRIVER_ARRIVED')`,
        sql`${pools.seatsTaken} + ${request.seats} <= ${pools.capacity}`,
      ),
    )
    .orderBy(asc(pools.createdAt))
    .limit(5);
}

/** Try claimSeats on candidate pools via savepoints; first success wins. */
export async function tryAutoMatch(
  tx: Tx,
  requestId: string,
  actorUserId: string,
  request: { pickupZoneId: number; seats: number; allowPool: boolean },
  deps: ClaimSeatsDeps,
): Promise<boolean> {
  const candidates = await findAutoMatchCandidates(tx, request);
  for (let i = 0; i < candidates.length; i++) {
    const poolId = candidates[i]!.id;
    const sp = `automatch_${i}`;
    await tx.execute(sql.raw(`SAVEPOINT ${sp}`));
    try {
      await claimSeats(tx, poolId, requestId, actorUserId, deps);
      await tx.execute(sql.raw(`RELEASE SAVEPOINT ${sp}`));
      return true;
    } catch (err) {
      await tx.execute(sql.raw(`ROLLBACK TO SAVEPOINT ${sp}`));
      if (err instanceof AppError) {
        if (
          err.code === ErrorCodes.POOL_FULL ||
          err.code === ErrorCodes.NOT_COMPATIBLE ||
          err.code === ErrorCodes.REQUEST_ALREADY_MATCHED
        ) {
          continue;
        }
      }
      throw err;
    }
  }
  return false;
}
