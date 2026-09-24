import { hash } from '@node-rs/argon2';
import { and, eq, sql } from 'drizzle-orm';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config.js';
import { createDb, createPool, type Db } from './client.js';
import {
  driverProfiles,
  poolMembers,
  pools,
  rideEvents,
  rideRequests,
  users,
  vehicles,
  walletTransactions,
  wallets,
  zoneDistances,
  zones,
} from './schema.js';

const SEED_PASSWORD = 'TeslaPool!2026';

/** Upper-triangle distances in km (DESIGN §5). Keys are zone ids 1..10 in table order. */
const DISTANCE_KM_UPPER: ReadonlyArray<readonly [number, number, number]> = [
  // from, to, km
  [1, 2, 2.8],
  [1, 3, 1.6],
  [1, 4, 2.5],
  [1, 5, 4.9],
  [1, 6, 5.9],
  [1, 7, 8.3],
  [1, 8, 5.3],
  [1, 9, 13.2],
  [1, 10, 6.4],
  [2, 3, 2.2],
  [2, 4, 1.6],
  [2, 5, 3.6],
  [2, 6, 5.2],
  [2, 7, 7.8],
  [2, 8, 7.9],
  [2, 9, 15.7],
  [2, 10, 6.7],
  [3, 4, 2.9],
  [3, 5, 5.3],
  [3, 6, 6.7],
  [3, 7, 9.3],
  [3, 8, 6.8],
  [3, 9, 13.6],
  [3, 10, 5.1],
  [4, 5, 2.4],
  [4, 6, 3.8],
  [4, 7, 6.4],
  [4, 8, 7.0],
  [4, 9, 15.7],
  [4, 10, 7.9],
  [5, 6, 1.7],
  [5, 7, 4.3],
  [5, 8, 8.3],
  [5, 9, 17.9],
  [5, 10, 10.3],
  [6, 7, 2.6],
  [6, 8, 8.2],
  [6, 9, 18.5],
  [6, 10, 11.8],
  [7, 8, 9.5],
  [7, 9, 20.2],
  [7, 10, 14.3],
  [8, 9, 10.9],
  [8, 10, 10.0],
  [9, 10, 12.2],
];

const ZONE_ROWS = [
  { id: 1, slug: 'banani', name: 'Banani', lat: '23.793700', lng: '90.402900' },
  { id: 2, slug: 'gulshan-1', name: 'Gulshan 1', lat: '23.780800', lng: '90.416100' },
  { id: 3, slug: 'gulshan-2', name: 'Gulshan 2', lat: '23.794600', lng: '90.414300' },
  { id: 4, slug: 'mohakhali', name: 'Mohakhali', lat: '23.777600', lng: '90.405600' },
  { id: 5, slug: 'tejgaon', name: 'Tejgaon', lat: '23.762600', lng: '90.400700' },
  { id: 6, slug: 'farmgate', name: 'Farmgate', lat: '23.757700', lng: '90.389700' },
  { id: 7, slug: 'dhanmondi', name: 'Dhanmondi', lat: '23.746500', lng: '90.376000' },
  { id: 8, slug: 'mirpur-10', name: 'Mirpur 10', lat: '23.806900', lng: '90.368700' },
  { id: 9, slug: 'uttara', name: 'Uttara', lat: '23.875900', lng: '90.379500' },
  { id: 10, slug: 'bashundhara', name: 'Bashundhara', lat: '23.819000', lng: '90.438000' },
] as const;

async function upsertZones(db: Db): Promise<void> {
  for (const zone of ZONE_ROWS) {
    await db
      .insert(zones)
      .values(zone)
      .onConflictDoUpdate({
        target: zones.id,
        set: {
          slug: zone.slug,
          name: zone.name,
          lat: zone.lat,
          lng: zone.lng,
        },
      });
  }

  const distanceRows = DISTANCE_KM_UPPER.flatMap(([from, to, km]) => {
    const distanceM = Math.round(km * 1000);
    return [
      { fromZoneId: from, toZoneId: to, distanceM },
      { fromZoneId: to, toZoneId: from, distanceM },
    ];
  });

  for (const row of distanceRows) {
    await db
      .insert(zoneDistances)
      .values(row)
      .onConflictDoUpdate({
        target: [zoneDistances.fromZoneId, zoneDistances.toZoneId],
        set: { distanceM: row.distanceM },
      });
  }
}

async function upsertUser(
  db: Db,
  input: {
    name: string;
    email: string;
    phone: string;
    role: 'PASSENGER' | 'DRIVER';
    passwordHash: string;
  },
) {
  const existing = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = lower(${input.email})`)
    .limit(1);
  if (existing[0]) {
    await db
      .update(users)
      .set({
        name: input.name,
        phone: input.phone,
        role: input.role,
        passwordHash: input.passwordHash,
      })
      .where(eq(users.id, existing[0].id));
    return existing[0].id;
  }
  const [row] = await db
    .insert(users)
    .values({
      name: input.name,
      email: input.email,
      phone: input.phone,
      role: input.role,
      passwordHash: input.passwordHash,
    })
    .returning({ id: users.id });
  if (!row) throw new Error(`Failed to insert user ${input.email}`);
  return row.id;
}

async function seedCast(db: Db, passwordHash: string): Promise<{
  jashimId: string;
  bulletId: string;
  nusratId: string;
  rafiqId: string;
  shirinId: string;
}> {
  const jashimId = await upsertUser(db, {
    name: 'Jashim',
    email: 'jashim@teslapool.test',
    phone: '+8801700000001',
    role: 'DRIVER',
    passwordHash,
  });
  const nusratId = await upsertUser(db, {
    name: 'Nusrat',
    email: 'nusrat@teslapool.test',
    phone: '+8801700000002',
    role: 'PASSENGER',
    passwordHash,
  });
  const rafiqId = await upsertUser(db, {
    name: 'Rafiq',
    email: 'rafiq@teslapool.test',
    phone: '+8801700000003',
    role: 'PASSENGER',
    passwordHash,
  });
  const shirinId = await upsertUser(db, {
    name: 'Shirin',
    email: 'shirin@teslapool.test',
    phone: '+8801700000004',
    role: 'PASSENGER',
    passwordHash,
  });

  await db
    .insert(driverProfiles)
    .values({
      userId: jashimId,
      isOnline: false,
      currentZoneId: 1,
    })
    .onConflictDoUpdate({
      target: driverProfiles.userId,
      set: { isOnline: false, currentZoneId: 1, updatedAt: sql`now()` },
    });

  const existingVehicle = await db
    .select()
    .from(vehicles)
    .where(eq(vehicles.plate, 'DHAKA-TESLA-11'))
    .limit(1);
  let bulletId = existingVehicle[0]?.id;
  if (!bulletId) {
    const [created] = await db
      .insert(vehicles)
      .values({
        driverId: jashimId,
        name: 'Bullet',
        plate: 'DHAKA-TESLA-11',
        capacity: 3,
      })
      .returning({ id: vehicles.id });
    if (!created) throw new Error('Failed to create Bullet');
    bulletId = created.id;
  } else {
    await db
      .update(vehicles)
      .set({ driverId: jashimId, name: 'Bullet', capacity: 3 })
      .where(eq(vehicles.id, bulletId));
  }

  const walletSeeds: Array<{ userId: string; balancePaisa: number }> = [
    { userId: nusratId, balancePaisa: 50_000 },
    { userId: rafiqId, balancePaisa: 30_000 },
    { userId: shirinId, balancePaisa: 5_000 },
  ];
  for (const w of walletSeeds) {
    // Do not overwrite balances on re-seed — historical ride debits must stick.
    await db.insert(wallets).values(w).onConflictDoNothing();
  }

  return { jashimId, bulletId, nusratId, rafiqId, shirinId };
}

async function ensureHistoricalPool(
  db: Db,
  cast: {
    jashimId: string;
    bulletId: string;
    nusratId: string;
    rafiqId: string;
  },
): Promise<void> {
  const existing = await db
    .select({ id: pools.id })
    .from(pools)
    .where(and(eq(pools.vehicleId, cast.bulletId), eq(pools.status, 'COMPLETED')))
    .limit(1);
  if (existing[0]) return;

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [nusratRide] = await db
    .insert(rideRequests)
    .values({
      passengerId: cast.nusratId,
      pickupZoneId: 1,
      dropoffZoneId: 4,
      seats: 1,
      allowPool: true,
      paymentMethod: 'WALLET',
      distanceM: 2500,
      soloFarePaisa: 10_250,
      finalFarePaisa: 9_000,
      status: 'COMPLETED',
      idempotencyKey: 'seed-history-nusrat',
      createdAt: yesterday,
      completedAt: yesterday,
    })
    .returning({ id: rideRequests.id });

  const [rafiqRide] = await db
    .insert(rideRequests)
    .values({
      passengerId: cast.rafiqId,
      pickupZoneId: 1,
      dropoffZoneId: 2,
      seats: 1,
      allowPool: true,
      paymentMethod: 'WALLET',
      distanceM: 2800,
      soloFarePaisa: 11_000,
      finalFarePaisa: 9_600,
      status: 'COMPLETED',
      idempotencyKey: 'seed-history-rafiq',
      createdAt: yesterday,
      completedAt: yesterday,
    })
    .returning({ id: rideRequests.id });

  if (!nusratRide || !rafiqRide) throw new Error('Failed to seed historical requests');

  const [pool] = await db
    .insert(pools)
    .values({
      vehicleId: cast.bulletId,
      driverId: cast.jashimId,
      pickupZoneId: 1,
      isShared: true,
      capacity: 3,
      seatsTaken: 2,
      status: 'COMPLETED',
      createdAt: yesterday,
      updatedAt: yesterday,
      startedAt: yesterday,
      completedAt: yesterday,
    })
    .returning({ id: pools.id });
  if (!pool) throw new Error('Failed to seed historical pool');

  await db.insert(poolMembers).values([
    {
      poolId: pool.id,
      rideRequestId: nusratRide.id,
      seats: 1,
      status: 'ACTIVE',
      baseFarePaisa: 4_000,
      distanceChargePaisa: 6_250,
      poolDiscountPaisa: 1_250,
      joinedAt: yesterday,
    },
    {
      poolId: pool.id,
      rideRequestId: rafiqRide.id,
      seats: 1,
      status: 'ACTIVE',
      baseFarePaisa: 4_000,
      distanceChargePaisa: 7_000,
      poolDiscountPaisa: 1_400,
      joinedAt: yesterday,
    },
  ]);

  await db.insert(rideEvents).values([
    {
      rideRequestId: nusratRide.id,
      poolId: pool.id,
      actorUserId: cast.nusratId,
      type: 'REQUEST_CREATED',
      toStatus: 'REQUESTED',
      createdAt: yesterday,
    },
    {
      rideRequestId: nusratRide.id,
      poolId: pool.id,
      actorUserId: cast.jashimId,
      type: 'POOL_CREATED',
      toStatus: 'ACCEPTED',
      createdAt: yesterday,
    },
    {
      rideRequestId: nusratRide.id,
      poolId: pool.id,
      actorUserId: cast.jashimId,
      type: 'MEMBER_JOINED',
      createdAt: yesterday,
    },
    {
      rideRequestId: rafiqRide.id,
      poolId: pool.id,
      actorUserId: cast.rafiqId,
      type: 'REQUEST_CREATED',
      toStatus: 'REQUESTED',
      createdAt: yesterday,
    },
    {
      rideRequestId: rafiqRide.id,
      poolId: pool.id,
      actorUserId: cast.rafiqId,
      type: 'MEMBER_JOINED',
      createdAt: yesterday,
    },
    {
      poolId: pool.id,
      actorUserId: cast.jashimId,
      type: 'POOL_STATUS_CHANGED',
      fromStatus: 'ACCEPTED',
      toStatus: 'COMPLETED',
      createdAt: yesterday,
    },
    {
      rideRequestId: nusratRide.id,
      poolId: pool.id,
      actorUserId: cast.jashimId,
      type: 'PAYMENT_CAPTURED',
      data: { farePaisa: 9000 },
      createdAt: yesterday,
    },
    {
      rideRequestId: rafiqRide.id,
      poolId: pool.id,
      actorUserId: cast.jashimId,
      type: 'PAYMENT_CAPTURED',
      data: { farePaisa: 9600 },
      createdAt: yesterday,
    },
  ]);

  // Historical wallet debits: Nusrat 500→410, Rafiq 300→204 (in taka: 50000-9000, 30000-9600)
  await db
    .update(wallets)
    .set({ balancePaisa: 41_000, updatedAt: sql`now()` })
    .where(eq(wallets.userId, cast.nusratId));
  await db
    .update(wallets)
    .set({ balancePaisa: 20_400, updatedAt: sql`now()` })
    .where(eq(wallets.userId, cast.rafiqId));

  await db.insert(walletTransactions).values([
    {
      userId: cast.nusratId,
      rideRequestId: nusratRide.id,
      type: 'RIDE_CHARGE',
      amountPaisa: -9_000,
      balanceAfterPaisa: 41_000,
      createdAt: yesterday,
    },
    {
      userId: cast.rafiqId,
      rideRequestId: rafiqRide.id,
      type: 'RIDE_CHARGE',
      amountPaisa: -9_600,
      balanceAfterPaisa: 20_400,
      createdAt: yesterday,
    },
  ]);
}

async function resetDynamicData(db: Db): Promise<void> {
  await db.execute(sql`TRUNCATE TABLE
    wallet_transactions,
    ride_events,
    pool_members,
    pools,
    ride_requests
    RESTART IDENTITY CASCADE`);
}

export async function seed(options: { reset?: boolean } = {}): Promise<void> {
  const config = loadConfig();
  const pool = createPool(config.DATABASE_URL);
  const db = createDb(pool);
  try {
    if (options.reset) {
      await resetDynamicData(db);
    }
    await upsertZones(db);
    const passwordHash = await hash(SEED_PASSWORD);
    const cast = await seedCast(db, passwordHash);
    await ensureHistoricalPool(db, cast);

    const userCount = await db.select({ count: sql<number>`count(*)::int` }).from(users);
    const poolCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(pools)
      .where(eq(pools.status, 'COMPLETED'));
    console.log(
      `Seed complete: ${userCount[0]?.count ?? 0} users, ${poolCount[0]?.count ?? 0} completed pool(s).`,
    );
  } finally {
    await pool.end();
  }
}

const isDirectRun = process.argv[1]
  ? fileURLToPath(import.meta.url) === resolve(process.argv[1])
  : false;

if (isDirectRun) {
  const reset = process.argv.includes('--reset');
  seed({ reset }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
