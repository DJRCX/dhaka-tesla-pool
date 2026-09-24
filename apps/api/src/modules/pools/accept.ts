import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import {
  driverProfiles,
  poolMembers,
  pools,
  rideRequests,
  vehicles,
} from '../../db/schema.js';
import { recordEvent } from '../../lib/events.js';
import { AppError, ErrorCodes, extractPgError, mapPostgresError } from '../../lib/errors.js';
import type { ClaimSeatsDeps } from './pool.service.js';
import { claimSeats } from './pool.service.js';

function mapPg(err: unknown): never {
  if (err instanceof AppError) throw err;
  const pg = extractPgError(err);
  if (pg) {
    const mapped = mapPostgresError(pg);
    if (mapped) throw mapped;
  }
  throw err;
}

export async function acceptRequest(
  db: Db,
  driverId: string,
  requestId: string,
  deps: ClaimSeatsDeps,
): Promise<{ poolId: string }> {
  try {
    return await db.transaction(async (tx) => {
      const [profile] = await tx
        .select()
        .from(driverProfiles)
        .where(eq(driverProfiles.userId, driverId))
        .limit(1);
      if (!profile?.isOnline || profile.currentZoneId == null) {
        throw new AppError(
          409,
          ErrorCodes.DRIVER_OFFLINE,
          'Go online in a zone before accepting rides.',
        );
      }

      const [vehicle] = await tx
        .select()
        .from(vehicles)
        .where(eq(vehicles.driverId, driverId))
        .limit(1);
      if (!vehicle) {
        throw new AppError(404, ErrorCodes.NOT_FOUND, 'No vehicle registered for this driver');
      }

      const [request] = await tx
        .select()
        .from(rideRequests)
        .where(eq(rideRequests.id, requestId))
        .for('update')
        .limit(1);
      if (!request || request.status !== 'REQUESTED') {
        throw new AppError(
          409,
          ErrorCodes.REQUEST_ALREADY_MATCHED,
          'This ride is already in a pool.',
        );
      }
      if (request.pickupZoneId !== profile.currentZoneId) {
        throw new AppError(
          409,
          ErrorCodes.NOT_COMPATIBLE,
          'You must be in the passenger pickup zone to accept.',
        );
      }

      let poolId: string;
      try {
        const [created] = await tx
          .insert(pools)
          .values({
            vehicleId: vehicle.id,
            driverId,
            pickupZoneId: request.pickupZoneId,
            isShared: request.allowPool,
            capacity: vehicle.capacity,
            seatsTaken: 0,
            status: 'ACCEPTED',
          })
          .returning({ id: pools.id });
        if (!created) throw new AppError(500, ErrorCodes.INTERNAL, 'Failed to create pool');
        poolId = created.id;
      } catch (err) {
        mapPg(err);
      }

      await recordEvent(
        tx,
        {
          poolId,
          rideRequestId: request.id,
          actorUserId: driverId,
          type: 'POOL_CREATED',
          toStatus: 'ACCEPTED',
        },
        deps.log,
      );

      await claimSeats(tx, poolId, request.id, driverId, deps);
      return { poolId };
    });
  } catch (err) {
    mapPg(err);
  }
}

export async function assertPoolInvariants(db: Db, poolId: string): Promise<void> {
  const [pool] = await db.select().from(pools).where(eq(pools.id, poolId)).limit(1);
  if (!pool) throw new Error(`assertPoolInvariants: pool ${poolId} missing`);

  const members = await db
    .select({
      seats: poolMembers.seats,
      rideRequestId: poolMembers.rideRequestId,
      requestStatus: rideRequests.status,
    })
    .from(poolMembers)
    .innerJoin(rideRequests, eq(poolMembers.rideRequestId, rideRequests.id))
    .where(and(eq(poolMembers.poolId, poolId), eq(poolMembers.status, 'ACTIVE')));

  const seatsSum = members.reduce((s, m) => s + m.seats, 0);
  if (seatsSum !== pool.seatsTaken) {
    throw new Error(`seats_taken ${pool.seatsTaken} != sum of member seats ${seatsSum}`);
  }
  if (pool.seatsTaken > pool.capacity) {
    throw new Error(`seats_taken ${pool.seatsTaken} > capacity ${pool.capacity}`);
  }

  const expectedRequestStatus =
    pool.status === 'ACCEPTED'
      ? 'MATCHED'
      : pool.status === 'CANCELLED'
        ? null
        : pool.status;

  if (expectedRequestStatus) {
    for (const m of members) {
      if (m.requestStatus !== expectedRequestStatus) {
        throw new Error(
          `member ${m.rideRequestId} status ${m.requestStatus} != pool-mapped ${expectedRequestStatus}`,
        );
      }
    }
  }
}
