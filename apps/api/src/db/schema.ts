import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', ['PASSENGER', 'DRIVER']);
export const requestStatusEnum = pgEnum('request_status', [
  'REQUESTED',
  'MATCHED',
  'DRIVER_ARRIVED',
  'STARTED',
  'COMPLETED',
  'CANCELLED',
]);
export const poolStatusEnum = pgEnum('pool_status', [
  'ACCEPTED',
  'DRIVER_ARRIVED',
  'STARTED',
  'COMPLETED',
  'CANCELLED',
]);
export const memberStatusEnum = pgEnum('member_status', ['ACTIVE', 'LEFT', 'REMOVED']);
export const paymentMethodEnum = pgEnum('payment_method', ['CASH', 'WALLET']);

export const zones = pgTable('zones', {
  id: smallint('id').primaryKey(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  lat: numeric('lat', { precision: 9, scale: 6 }).notNull(),
  lng: numeric('lng', { precision: 9, scale: 6 }).notNull(),
}, (t) => [
  uniqueIndex('zones_slug_uidx').on(t.slug),
]);

export const zoneDistances = pgTable(
  'zone_distances',
  {
    fromZoneId: smallint('from_zone_id').notNull(),
    toZoneId: smallint('to_zone_id').notNull(),
    distanceM: integer('distance_m').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.fromZoneId, t.toZoneId] }),
    foreignKey({
      columns: [t.fromZoneId],
      foreignColumns: [zones.id],
      name: 'zone_distances_from_fk',
    }),
    foreignKey({
      columns: [t.toZoneId],
      foreignColumns: [zones.id],
      name: 'zone_distances_to_fk',
    }),
    check('zone_distances_distinct', sql`${t.fromZoneId} <> ${t.toZoneId}`),
    check(
      'zone_distances_granularity',
      sql`${t.distanceM} > 0 AND ${t.distanceM} % 100 = 0`,
    ),
  ],
);

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    role: userRoleEnum('role').notNull(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    phone: text('phone').notNull(),
    passwordHash: text('password_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('users_email_lower_uidx').on(sql`lower(${t.email})`),
    uniqueIndex('users_phone_uidx').on(t.phone),
    check('users_name_length', sql`char_length(${t.name}) BETWEEN 1 AND 80`),
  ],
);

export const driverProfiles = pgTable(
  'driver_profiles',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    isOnline: boolean('is_online').notNull().default(false),
    currentZoneId: smallint('current_zone_id').references(() => zones.id),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'driver_online_requires_zone',
      sql`NOT ${t.isOnline} OR ${t.currentZoneId} IS NOT NULL`,
    ),
  ],
);

export const vehicles = pgTable(
  'vehicles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    driverId: uuid('driver_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    plate: text('plate').notNull(),
    capacity: smallint('capacity').notNull(),
  },
  (t) => [
    uniqueIndex('vehicles_driver_uidx').on(t.driverId),
    uniqueIndex('vehicles_plate_uidx').on(t.plate),
    check('vehicles_capacity_range', sql`${t.capacity} BETWEEN 1 AND 6`),
  ],
);

export const rideRequests = pgTable(
  'ride_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    passengerId: uuid('passenger_id')
      .notNull()
      .references(() => users.id),
    pickupZoneId: smallint('pickup_zone_id')
      .notNull()
      .references(() => zones.id),
    dropoffZoneId: smallint('dropoff_zone_id')
      .notNull()
      .references(() => zones.id),
    seats: smallint('seats').notNull(),
    allowPool: boolean('allow_pool').notNull().default(true),
    paymentMethod: paymentMethodEnum('payment_method').notNull(),
    distanceM: integer('distance_m').notNull(),
    soloFarePaisa: integer('solo_fare_paisa').notNull(),
    finalFarePaisa: integer('final_fare_paisa'),
    status: requestStatusEnum('status').notNull().default('REQUESTED'),
    idempotencyKey: text('idempotency_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    check('ride_requests_zones_distinct', sql`${t.pickupZoneId} <> ${t.dropoffZoneId}`),
    check('ride_requests_seats_range', sql`${t.seats} BETWEEN 1 AND 6`),
    check('ride_requests_solo_fare_nonneg', sql`${t.soloFarePaisa} >= 0`),
    uniqueIndex('one_active_request_per_passenger')
      .on(t.passengerId)
      .where(
        sql`${t.status} IN ('REQUESTED','MATCHED','DRIVER_ARRIVED','STARTED')`,
      ),
    uniqueIndex('ride_requests_passenger_idempotency_uidx').on(
      t.passengerId,
      t.idempotencyKey,
    ),
    index('ride_requests_waiting_feed_idx')
      .on(t.pickupZoneId, t.createdAt)
      .where(sql`${t.status} = 'REQUESTED'`),
    index('ride_requests_passenger_history_idx').on(t.passengerId, t.createdAt),
  ],
);

export const pools = pgTable(
  'pools',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    vehicleId: uuid('vehicle_id')
      .notNull()
      .references(() => vehicles.id),
    driverId: uuid('driver_id')
      .notNull()
      .references(() => users.id),
    pickupZoneId: smallint('pickup_zone_id')
      .notNull()
      .references(() => zones.id),
    isShared: boolean('is_shared').notNull().default(true),
    capacity: smallint('capacity').notNull(),
    seatsTaken: smallint('seats_taken').notNull().default(0),
    status: poolStatusEnum('status').notNull().default('ACCEPTED'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    check(
      'pools_seats_within_capacity',
      sql`${t.seatsTaken} BETWEEN 0 AND ${t.capacity}`,
    ),
    uniqueIndex('one_active_pool_per_vehicle')
      .on(t.vehicleId)
      .where(sql`${t.status} IN ('ACCEPTED','DRIVER_ARRIVED','STARTED')`),
    index('pools_matching_candidates_idx')
      .on(t.pickupZoneId, t.createdAt)
      .where(
        sql`${t.status} IN ('ACCEPTED','DRIVER_ARRIVED') AND ${t.isShared}`,
      ),
    index('pools_driver_history_idx').on(t.driverId, t.createdAt),
  ],
);

export const poolMembers = pgTable(
  'pool_members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    poolId: uuid('pool_id')
      .notNull()
      .references(() => pools.id),
    rideRequestId: uuid('ride_request_id')
      .notNull()
      .references(() => rideRequests.id),
    seats: smallint('seats').notNull(),
    status: memberStatusEnum('status').notNull().default('ACTIVE'),
    baseFarePaisa: integer('base_fare_paisa').notNull(),
    distanceChargePaisa: integer('distance_charge_paisa').notNull(),
    poolDiscountPaisa: integer('pool_discount_paisa').notNull().default(0),
    // Generated in SQL migration: base + distance - discount
    farePaisa: integer('fare_paisa').generatedAlwaysAs(
      sql`base_fare_paisa + distance_charge_paisa - pool_discount_paisa`,
    ),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp('left_at', { withTimezone: true }),
  },
  (t) => [
    check('pool_members_seats_positive', sql`${t.seats} >= 1`),
    check('pool_members_fare_nonneg', sql`${t.farePaisa} >= 0`),
    uniqueIndex('one_active_membership_per_request')
      .on(t.rideRequestId)
      .where(sql`${t.status} = 'ACTIVE'`),
    index('pool_members_active_by_pool_idx')
      .on(t.poolId)
      .where(sql`${t.status} = 'ACTIVE'`),
  ],
);

export const rideEvents = pgTable(
  'ride_events',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    rideRequestId: uuid('ride_request_id').references(() => rideRequests.id),
    poolId: uuid('pool_id').references(() => pools.id),
    actorUserId: uuid('actor_user_id').references(() => users.id),
    type: text('type').notNull(),
    fromStatus: text('from_status'),
    toStatus: text('to_status'),
    data: jsonb('data'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'ride_events_has_subject',
      sql`${t.rideRequestId} IS NOT NULL OR ${t.poolId} IS NOT NULL`,
    ),
    index('ride_events_request_idx').on(t.rideRequestId, t.id),
    index('ride_events_pool_idx').on(t.poolId, t.id),
  ],
);

export const wallets = pgTable(
  'wallets',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    balancePaisa: bigint('balance_paisa', { mode: 'number' }).notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('wallets_balance_nonneg', sql`${t.balancePaisa} >= 0`)],
);

export const walletTransactions = pgTable(
  'wallet_transactions',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    rideRequestId: uuid('ride_request_id').references(() => rideRequests.id),
    type: text('type').notNull(),
    amountPaisa: bigint('amount_paisa', { mode: 'number' }).notNull(),
    balanceAfterPaisa: bigint('balance_after_paisa', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('wallet_tx_one_charge_per_ride')
      .on(t.rideRequestId, t.type)
      .where(sql`${t.rideRequestId} IS NOT NULL`),
  ],
);
