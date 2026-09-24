CREATE TYPE "public"."member_status" AS ENUM('ACTIVE', 'LEFT', 'REMOVED');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('CASH', 'WALLET');--> statement-breakpoint
CREATE TYPE "public"."pool_status" AS ENUM('ACCEPTED', 'DRIVER_ARRIVED', 'STARTED', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('REQUESTED', 'MATCHED', 'DRIVER_ARRIVED', 'STARTED', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('PASSENGER', 'DRIVER');--> statement-breakpoint
CREATE TABLE "driver_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"is_online" boolean DEFAULT false NOT NULL,
	"current_zone_id" smallint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "driver_online_requires_zone" CHECK (NOT "driver_profiles"."is_online" OR "driver_profiles"."current_zone_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "pool_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pool_id" uuid NOT NULL,
	"ride_request_id" uuid NOT NULL,
	"seats" smallint NOT NULL,
	"status" "member_status" DEFAULT 'ACTIVE' NOT NULL,
	"base_fare_paisa" integer NOT NULL,
	"distance_charge_paisa" integer NOT NULL,
	"pool_discount_paisa" integer DEFAULT 0 NOT NULL,
	"fare_paisa" integer GENERATED ALWAYS AS (base_fare_paisa + distance_charge_paisa - pool_discount_paisa) STORED,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	CONSTRAINT "pool_members_seats_positive" CHECK ("pool_members"."seats" >= 1),
	CONSTRAINT "pool_members_fare_nonneg" CHECK ("pool_members"."fare_paisa" >= 0)
);
--> statement-breakpoint
CREATE TABLE "pools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"driver_id" uuid NOT NULL,
	"pickup_zone_id" smallint NOT NULL,
	"is_shared" boolean DEFAULT true NOT NULL,
	"capacity" smallint NOT NULL,
	"seats_taken" smallint DEFAULT 0 NOT NULL,
	"status" "pool_status" DEFAULT 'ACCEPTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "pools_seats_within_capacity" CHECK ("pools"."seats_taken" BETWEEN 0 AND "pools"."capacity")
);
--> statement-breakpoint
CREATE TABLE "ride_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ride_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"ride_request_id" uuid,
	"pool_id" uuid,
	"actor_user_id" uuid,
	"type" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ride_events_has_subject" CHECK ("ride_events"."ride_request_id" IS NOT NULL OR "ride_events"."pool_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "ride_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"passenger_id" uuid NOT NULL,
	"pickup_zone_id" smallint NOT NULL,
	"dropoff_zone_id" smallint NOT NULL,
	"seats" smallint NOT NULL,
	"allow_pool" boolean DEFAULT true NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"distance_m" integer NOT NULL,
	"solo_fare_paisa" integer NOT NULL,
	"final_fare_paisa" integer,
	"status" "request_status" DEFAULT 'REQUESTED' NOT NULL,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "ride_requests_zones_distinct" CHECK ("ride_requests"."pickup_zone_id" <> "ride_requests"."dropoff_zone_id"),
	CONSTRAINT "ride_requests_seats_range" CHECK ("ride_requests"."seats" BETWEEN 1 AND 6),
	CONSTRAINT "ride_requests_solo_fare_nonneg" CHECK ("ride_requests"."solo_fare_paisa" >= 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role" "user_role" NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_name_length" CHECK (char_length("users"."name") BETWEEN 1 AND 80)
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid NOT NULL,
	"name" text NOT NULL,
	"plate" text NOT NULL,
	"capacity" smallint NOT NULL,
	CONSTRAINT "vehicles_capacity_range" CHECK ("vehicles"."capacity" BETWEEN 1 AND 6)
);
--> statement-breakpoint
CREATE TABLE "wallet_transactions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wallet_transactions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" uuid NOT NULL,
	"ride_request_id" uuid,
	"type" text NOT NULL,
	"amount_paisa" bigint NOT NULL,
	"balance_after_paisa" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"balance_paisa" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallets_balance_nonneg" CHECK ("wallets"."balance_paisa" >= 0)
);
--> statement-breakpoint
CREATE TABLE "zone_distances" (
	"from_zone_id" smallint NOT NULL,
	"to_zone_id" smallint NOT NULL,
	"distance_m" integer NOT NULL,
	CONSTRAINT "zone_distances_from_zone_id_to_zone_id_pk" PRIMARY KEY("from_zone_id","to_zone_id"),
	CONSTRAINT "zone_distances_distinct" CHECK ("zone_distances"."from_zone_id" <> "zone_distances"."to_zone_id"),
	CONSTRAINT "zone_distances_granularity" CHECK ("zone_distances"."distance_m" > 0 AND "zone_distances"."distance_m" % 100 = 0)
);
--> statement-breakpoint
CREATE TABLE "zones" (
	"id" smallint PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"lat" numeric(9, 6) NOT NULL,
	"lng" numeric(9, 6) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "driver_profiles" ADD CONSTRAINT "driver_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_profiles" ADD CONSTRAINT "driver_profiles_current_zone_id_zones_id_fk" FOREIGN KEY ("current_zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_members" ADD CONSTRAINT "pool_members_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_members" ADD CONSTRAINT "pool_members_ride_request_id_ride_requests_id_fk" FOREIGN KEY ("ride_request_id") REFERENCES "public"."ride_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pools" ADD CONSTRAINT "pools_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pools" ADD CONSTRAINT "pools_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pools" ADD CONSTRAINT "pools_pickup_zone_id_zones_id_fk" FOREIGN KEY ("pickup_zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_events" ADD CONSTRAINT "ride_events_ride_request_id_ride_requests_id_fk" FOREIGN KEY ("ride_request_id") REFERENCES "public"."ride_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_events" ADD CONSTRAINT "ride_events_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_events" ADD CONSTRAINT "ride_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_passenger_id_users_id_fk" FOREIGN KEY ("passenger_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_pickup_zone_id_zones_id_fk" FOREIGN KEY ("pickup_zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_dropoff_zone_id_zones_id_fk" FOREIGN KEY ("dropoff_zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_ride_request_id_ride_requests_id_fk" FOREIGN KEY ("ride_request_id") REFERENCES "public"."ride_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_distances" ADD CONSTRAINT "zone_distances_from_fk" FOREIGN KEY ("from_zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_distances" ADD CONSTRAINT "zone_distances_to_fk" FOREIGN KEY ("to_zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_membership_per_request" ON "pool_members" USING btree ("ride_request_id") WHERE "pool_members"."status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "pool_members_active_by_pool_idx" ON "pool_members" USING btree ("pool_id") WHERE "pool_members"."status" = 'ACTIVE';--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_pool_per_vehicle" ON "pools" USING btree ("vehicle_id") WHERE "pools"."status" IN ('ACCEPTED','DRIVER_ARRIVED','STARTED');--> statement-breakpoint
CREATE INDEX "pools_matching_candidates_idx" ON "pools" USING btree ("pickup_zone_id","created_at") WHERE "pools"."status" IN ('ACCEPTED','DRIVER_ARRIVED') AND "pools"."is_shared";--> statement-breakpoint
CREATE INDEX "pools_driver_history_idx" ON "pools" USING btree ("driver_id","created_at");--> statement-breakpoint
CREATE INDEX "ride_events_request_idx" ON "ride_events" USING btree ("ride_request_id","id");--> statement-breakpoint
CREATE INDEX "ride_events_pool_idx" ON "ride_events" USING btree ("pool_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_request_per_passenger" ON "ride_requests" USING btree ("passenger_id") WHERE "ride_requests"."status" IN ('REQUESTED','MATCHED','DRIVER_ARRIVED','STARTED');--> statement-breakpoint
CREATE UNIQUE INDEX "ride_requests_passenger_idempotency_uidx" ON "ride_requests" USING btree ("passenger_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "ride_requests_waiting_feed_idx" ON "ride_requests" USING btree ("pickup_zone_id","created_at") WHERE "ride_requests"."status" = 'REQUESTED';--> statement-breakpoint
CREATE INDEX "ride_requests_passenger_history_idx" ON "ride_requests" USING btree ("passenger_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_uidx" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_uidx" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_driver_uidx" ON "vehicles" USING btree ("driver_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_plate_uidx" ON "vehicles" USING btree ("plate");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_tx_one_charge_per_ride" ON "wallet_transactions" USING btree ("ride_request_id","type") WHERE "wallet_transactions"."ride_request_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "zones_slug_uidx" ON "zones" USING btree ("slug");