import { describe, expect, it } from 'vitest';
import { testDb } from './setup.js';
import {
  pools,
  rideRequests,
  users,
  vehicles,
  wallets,
  zones,
} from '../src/db/schema.js';

function pgCode(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const withCause = err as { code?: string; cause?: { code?: string } };
  return withCause.cause?.code ?? withCause.code;
}

async function expectPgCode(promise: Promise<unknown>, code: string) {
  try {
    await promise;
    throw new Error(`Expected Postgres error ${code}, but the query succeeded`);
  } catch (err) {
    expect(pgCode(err)).toBe(code);
  }
}

async function seedMinimal() {
  await testDb.insert(zones).values({
    id: 1,
    slug: 'banani',
    name: 'Banani',
    lat: '23.793700',
    lng: '90.402900',
  });
  await testDb.insert(zones).values({
    id: 4,
    slug: 'mohakhali',
    name: 'Mohakhali',
    lat: '23.777600',
    lng: '90.405600',
  });

  const [jashim] = await testDb
    .insert(users)
    .values({
      role: 'DRIVER',
      name: 'Jashim',
      email: 'jashim@teslapool.test',
      phone: '+8801700000001',
      passwordHash: 'x',
    })
    .returning({ id: users.id });
  const [nusrat] = await testDb
    .insert(users)
    .values({
      role: 'PASSENGER',
      name: 'Nusrat',
      email: 'nusrat@teslapool.test',
      phone: '+8801700000002',
      passwordHash: 'x',
    })
    .returning({ id: users.id });
  if (!jashim || !nusrat) throw new Error('seed failed');

  const [bullet] = await testDb
    .insert(vehicles)
    .values({
      driverId: jashim.id,
      name: 'Bullet',
      plate: 'DHAKA-TESLA-11',
      capacity: 3,
    })
    .returning({ id: vehicles.id });
  if (!bullet) throw new Error('bullet failed');

  await testDb.insert(wallets).values({ userId: nusrat.id, balancePaisa: 50_000 });

  return { jashim, nusrat, bullet };
}

describe('database constraints', () => {
  it('rejects seats_taken over Bullet capacity (23514)', async () => {
    const { jashim, bullet } = await seedMinimal();
    await expectPgCode(
      testDb.insert(pools).values({
        vehicleId: bullet.id,
        driverId: jashim.id,
        pickupZoneId: 1,
        capacity: 3,
        seatsTaken: 4,
        status: 'ACCEPTED',
      }),
      '23514',
    );
  });

  it('rejects a second active pool for Bullet (23505)', async () => {
    const { jashim, bullet } = await seedMinimal();
    await testDb.insert(pools).values({
      vehicleId: bullet.id,
      driverId: jashim.id,
      pickupZoneId: 1,
      capacity: 3,
      seatsTaken: 1,
      status: 'ACCEPTED',
    });
    await expectPgCode(
      testDb.insert(pools).values({
        vehicleId: bullet.id,
        driverId: jashim.id,
        pickupZoneId: 1,
        capacity: 3,
        seatsTaken: 1,
        status: 'DRIVER_ARRIVED',
      }),
      '23505',
    );
  });

  it('rejects a second active ride request for Nusrat (23505)', async () => {
    const { nusrat } = await seedMinimal();
    await testDb.insert(rideRequests).values({
      passengerId: nusrat.id,
      pickupZoneId: 1,
      dropoffZoneId: 4,
      seats: 1,
      paymentMethod: 'CASH',
      distanceM: 2500,
      soloFarePaisa: 10_250,
      status: 'REQUESTED',
      idempotencyKey: 'a',
    });
    await expectPgCode(
      testDb.insert(rideRequests).values({
        passengerId: nusrat.id,
        pickupZoneId: 1,
        dropoffZoneId: 4,
        seats: 1,
        paymentMethod: 'CASH',
        distanceM: 2500,
        soloFarePaisa: 10_250,
        status: 'MATCHED',
        idempotencyKey: 'b',
      }),
      '23505',
    );
  });

  it('rejects a negative wallet balance (23514)', async () => {
    const { nusrat } = await seedMinimal();
    await expectPgCode(
      testDb
        .insert(wallets)
        .values({ userId: nusrat.id, balancePaisa: -1 })
        .onConflictDoUpdate({
          target: wallets.userId,
          set: { balancePaisa: -1 },
        }),
      '23514',
    );
  });
});
