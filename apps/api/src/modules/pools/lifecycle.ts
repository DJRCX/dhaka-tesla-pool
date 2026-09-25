import { and, eq, inArray } from 'drizzle-orm';
import type { PoolStatus } from '@teslapool/shared';
import type { Db } from '../../db/client.js';
import { poolMembers, pools, rideRequests } from '../../db/schema.js';
import { recordEvent } from '../../lib/events.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import { assertTransition, canTransition } from '../../lib/state-machine.js';
import { assertPoolInvariants } from '../pools/accept.js';
import { settleMemberPayment } from '../wallet/charge.js';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const ACTIVE_POOL: PoolStatus[] = ['ACCEPTED', 'DRIVER_ARRIVED', 'STARTED'];

/** Map pool status → request status for active members (ACCEPTED → MATCHED). */
function requestStatusForPool(poolStatus: PoolStatus): string {
  if (poolStatus === 'ACCEPTED') return 'MATCHED';
  return poolStatus;
}

export function nextPoolActions(status: PoolStatus): string[] {
  const actions: string[] = [];
  if (canTransition('pool', status, 'DRIVER_ARRIVED')) actions.push('arrive');
  if (canTransition('pool', status, 'STARTED')) actions.push('start');
  if (canTransition('pool', status, 'COMPLETED')) actions.push('complete');
  if (canTransition('pool', status, 'CANCELLED')) actions.push('cancel');
  return actions;
}

async function lockOwnedPool(tx: Tx, poolId: string, driverId: string) {
  const [pool] = await tx
    .select()
    .from(pools)
    .where(eq(pools.id, poolId))
    .for('update')
    .limit(1);
  if (!pool || pool.driverId !== driverId) {
    throw new AppError(404, ErrorCodes.NOT_FOUND, 'Pool not found');
  }
  return pool;
}

async function activeMembers(tx: Tx, poolId: string) {
  return tx
    .select({
      memberId: poolMembers.id,
      rideRequestId: poolMembers.rideRequestId,
      seats: poolMembers.seats,
      farePaisa: poolMembers.farePaisa,
      baseFarePaisa: poolMembers.baseFarePaisa,
      distanceChargePaisa: poolMembers.distanceChargePaisa,
      poolDiscountPaisa: poolMembers.poolDiscountPaisa,
      paymentMethod: rideRequests.paymentMethod,
      passengerId: rideRequests.passengerId,
    })
    .from(poolMembers)
    .innerJoin(rideRequests, eq(poolMembers.rideRequestId, rideRequests.id))
    .where(and(eq(poolMembers.poolId, poolId), eq(poolMembers.status, 'ACTIVE')));
}

async function syncMemberRequestStatuses(
  tx: Tx,
  members: Array<{ rideRequestId: string }>,
  fromPoolStatus: PoolStatus,
  toPoolStatus: PoolStatus,
  actorUserId: string,
  poolId: string,
  log?: { info: (obj: object, msg?: string) => void },
) {
  const fromReq = requestStatusForPool(fromPoolStatus);
  const toReq = requestStatusForPool(toPoolStatus);
  for (const m of members) {
    if (fromReq === toReq) continue;
    assertTransition('request', fromReq, toReq);
    await tx
      .update(rideRequests)
      .set({
        status: toReq as 'MATCHED' | 'DRIVER_ARRIVED' | 'STARTED' | 'COMPLETED',
        ...(toReq === 'COMPLETED' ? { completedAt: new Date() } : {}),
      })
      .where(eq(rideRequests.id, m.rideRequestId));
    await recordEvent(
      tx,
      {
        rideRequestId: m.rideRequestId,
        poolId,
        actorUserId,
        type: 'REQUEST_STATUS_CHANGED',
        fromStatus: fromReq,
        toStatus: toReq,
      },
      log,
    );
  }
}

export async function arrivePool(
  db: Db,
  driverId: string,
  poolId: string,
  log?: { info: (obj: object, msg?: string) => void },
) {
  await db.transaction(async (tx) => {
    const pool = await lockOwnedPool(tx, poolId, driverId);
    assertTransition('pool', pool.status, 'DRIVER_ARRIVED');
    const members = await activeMembers(tx, poolId);
    await tx
      .update(pools)
      .set({ status: 'DRIVER_ARRIVED', updatedAt: new Date() })
      .where(eq(pools.id, poolId));
    await recordEvent(
      tx,
      {
        poolId,
        actorUserId: driverId,
        type: 'POOL_STATUS_CHANGED',
        fromStatus: pool.status,
        toStatus: 'DRIVER_ARRIVED',
      },
      log,
    );
    await syncMemberRequestStatuses(
      tx,
      members,
      pool.status,
      'DRIVER_ARRIVED',
      driverId,
      poolId,
      log,
    );
  });
  await assertPoolInvariants(db, poolId);
}

export async function startPool(
  db: Db,
  driverId: string,
  poolId: string,
  log?: { info: (obj: object, msg?: string) => void },
) {
  await db.transaction(async (tx) => {
    const pool = await lockOwnedPool(tx, poolId, driverId);
    assertTransition('pool', pool.status, 'STARTED');
    const members = await activeMembers(tx, poolId);
    if (members.length < 1) {
      throw new AppError(
        409,
        ErrorCodes.INVALID_TRANSITION,
        'Cannot start a pool with no active members',
      );
    }
    await tx
      .update(pools)
      .set({ status: 'STARTED', startedAt: new Date(), updatedAt: new Date() })
      .where(eq(pools.id, poolId));
    await recordEvent(
      tx,
      {
        poolId,
        actorUserId: driverId,
        type: 'POOL_STATUS_CHANGED',
        fromStatus: pool.status,
        toStatus: 'STARTED',
      },
      log,
    );
    await syncMemberRequestStatuses(tx, members, pool.status, 'STARTED', driverId, poolId, log);
    for (const m of members) {
      await recordEvent(
        tx,
        {
          rideRequestId: m.rideRequestId,
          poolId,
          actorUserId: driverId,
          type: 'FARE_FINALIZED',
          data: {
            basePaisa: m.baseFarePaisa,
            distancePaisa: m.distanceChargePaisa,
            discountPaisa: m.poolDiscountPaisa,
            totalPaisa:
              m.farePaisa ??
              m.baseFarePaisa + m.distanceChargePaisa - m.poolDiscountPaisa,
          },
        },
        log,
      );
    }
  });
  await assertPoolInvariants(db, poolId);
}

export async function completePool(
  db: Db,
  driverId: string,
  poolId: string,
  log?: { info: (obj: object, msg?: string) => void },
) {
  await db.transaction(async (tx) => {
    const pool = await lockOwnedPool(tx, poolId, driverId);
    assertTransition('pool', pool.status, 'COMPLETED');
    const members = await activeMembers(tx, poolId);

    await tx
      .update(pools)
      .set({ status: 'COMPLETED', completedAt: new Date(), updatedAt: new Date() })
      .where(eq(pools.id, poolId));
    await recordEvent(
      tx,
      {
        poolId,
        actorUserId: driverId,
        type: 'POOL_STATUS_CHANGED',
        fromStatus: pool.status,
        toStatus: 'COMPLETED',
      },
      log,
    );

    for (const m of members) {
      const fare =
        m.farePaisa ?? m.baseFarePaisa + m.distanceChargePaisa - m.poolDiscountPaisa;
      assertTransition('request', 'STARTED', 'COMPLETED');
      await tx
        .update(rideRequests)
        .set({
          status: 'COMPLETED',
          finalFarePaisa: fare,
          completedAt: new Date(),
        })
        .where(eq(rideRequests.id, m.rideRequestId));
      await recordEvent(
        tx,
        {
          rideRequestId: m.rideRequestId,
          poolId,
          actorUserId: driverId,
          type: 'REQUEST_STATUS_CHANGED',
          fromStatus: 'STARTED',
          toStatus: 'COMPLETED',
        },
        log,
      );
      await settleMemberPayment(
        tx,
        {
          userId: m.passengerId,
          rideRequestId: m.rideRequestId,
          poolId,
          farePaisa: fare,
          paymentMethod: m.paymentMethod,
          actorUserId: driverId,
        },
        log,
      );
    }
  });
}

export async function cancelPool(
  db: Db,
  driverId: string,
  poolId: string,
  log?: { info: (obj: object, msg?: string) => void },
) {
  await db.transaction(async (tx) => {
    const pool = await lockOwnedPool(tx, poolId, driverId);
    assertTransition('pool', pool.status, 'CANCELLED');
    const members = await activeMembers(tx, poolId);

    for (const m of members) {
      const [req] = await tx
        .select({ status: rideRequests.status })
        .from(rideRequests)
        .where(eq(rideRequests.id, m.rideRequestId))
        .for('update')
        .limit(1);
      if (!req) continue;
      assertTransition('request', req.status, 'REQUESTED');
      await tx
        .update(poolMembers)
        .set({ status: 'REMOVED', leftAt: new Date() })
        .where(eq(poolMembers.id, m.memberId));
      await tx
        .update(rideRequests)
        .set({ status: 'REQUESTED' })
        .where(eq(rideRequests.id, m.rideRequestId));
      await recordEvent(
        tx,
        {
          rideRequestId: m.rideRequestId,
          poolId,
          actorUserId: driverId,
          type: 'MEMBER_REMOVED',
        },
        log,
      );
      await recordEvent(
        tx,
        {
          rideRequestId: m.rideRequestId,
          poolId,
          actorUserId: driverId,
          type: 'REQUEST_STATUS_CHANGED',
          fromStatus: req.status,
          toStatus: 'REQUESTED',
        },
        log,
      );
    }

    await tx
      .update(pools)
      .set({ status: 'CANCELLED', seatsTaken: 0, updatedAt: new Date() })
      .where(eq(pools.id, poolId));
    await recordEvent(
      tx,
      {
        poolId,
        actorUserId: driverId,
        type: 'POOL_STATUS_CHANGED',
        fromStatus: pool.status,
        toStatus: 'CANCELLED',
      },
      log,
    );
  });
}

export async function driverHasActivePool(db: Db, driverId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: pools.id })
    .from(pools)
    .where(and(eq(pools.driverId, driverId), inArray(pools.status, ACTIVE_POOL)))
    .limit(1);
  return Boolean(row);
}

export { canTransition, ACTIVE_POOL };
