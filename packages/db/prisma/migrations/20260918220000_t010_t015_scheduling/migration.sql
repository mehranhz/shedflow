-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('GOOGLE_MEET', 'LINK', 'PHONE', 'IN_PERSON', 'CUSTOM');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING_PAYMENT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'CANCELLED', 'RESCHEDULED', 'EXPIRED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "BookingSource" AS ENUM ('HOSTED', 'EMBED', 'API', 'DASHBOARD');

-- CreateTable
CREATE TABLE "schedules" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "host_user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_rules" (
    "id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,

    CONSTRAINT "availability_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "date_overrides" (
    "id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "is_unavailable" BOOLEAN NOT NULL DEFAULT false,
    "start_minute" INTEGER,
    "end_minute" INTEGER,

    CONSTRAINT "date_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_types" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "host_user_id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "duration_minutes" INTEGER NOT NULL,
    "location_type" "LocationType" NOT NULL,
    "location_value" TEXT,
    "buffer_before_minutes" INTEGER NOT NULL DEFAULT 0,
    "buffer_after_minutes" INTEGER NOT NULL DEFAULT 0,
    "min_notice_minutes" INTEGER NOT NULL DEFAULT 60,
    "max_days_ahead" INTEGER NOT NULL DEFAULT 60,
    "slot_interval_minutes" INTEGER NOT NULL DEFAULT 0,
    "daily_cap" INTEGER,
    "requires_confirmation" BOOLEAN NOT NULL DEFAULT false,
    "cancellation_notice_hours" INTEGER NOT NULL DEFAULT 24,
    "reschedule_notice_hours" INTEGER NOT NULL DEFAULT 24,
    "price_id" UUID,
    "subscription_product_id" UUID,
    "credit_cost" INTEGER NOT NULL DEFAULT 0,
    "questions" JSONB NOT NULL DEFAULT '[]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_hidden" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "event_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "timezone" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "uid" TEXT NOT NULL,
    "organization_id" UUID NOT NULL,
    "event_type_id" UUID NOT NULL,
    "host_user_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "start_at" TIMESTAMPTZ(3) NOT NULL,
    "end_at" TIMESTAMPTZ(3) NOT NULL,
    "buffer_before_minutes" INTEGER NOT NULL,
    "buffer_after_minutes" INTEGER NOT NULL,
    "timezone" TEXT NOT NULL,
    "status" "BookingStatus" NOT NULL,
    "source" "BookingSource" NOT NULL,
    "location_type" "LocationType" NOT NULL,
    "location_value" TEXT,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "cancellation_reason" TEXT,
    "rescheduled_from_id" UUID,
    "payment_id" UUID,
    "subscription_id" UUID,
    "hold_expires_at" TIMESTAMPTZ(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signed_action_tokens" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signed_action_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "schedules_organization_id_host_user_id_idx" ON "schedules"("organization_id", "host_user_id");

-- CreateIndex
CREATE INDEX "availability_rules_schedule_id_day_of_week_idx" ON "availability_rules"("schedule_id", "day_of_week");

-- CreateIndex
CREATE UNIQUE INDEX "date_overrides_schedule_id_date_key" ON "date_overrides"("schedule_id", "date");

-- CreateIndex
CREATE INDEX "event_types_organization_id_host_user_id_idx" ON "event_types"("organization_id", "host_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_types_organization_id_slug_key" ON "event_types"("organization_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "customers_organization_id_email_key" ON "customers"("organization_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_uid_key" ON "bookings"("uid");

-- CreateIndex
CREATE INDEX "bookings_organization_id_start_at_idx" ON "bookings"("organization_id", "start_at");

-- CreateIndex
CREATE INDEX "bookings_host_user_id_start_at_idx" ON "bookings"("host_user_id", "start_at");

-- CreateIndex
CREATE INDEX "bookings_event_type_id_start_at_idx" ON "bookings"("event_type_id", "start_at");

-- CreateIndex
CREATE INDEX "bookings_customer_id_idx" ON "bookings"("customer_id");

-- CreateIndex
CREATE INDEX "bookings_status_hold_expires_at_idx" ON "bookings"("status", "hold_expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "signed_action_tokens_token_hash_key" ON "signed_action_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "signed_action_tokens_booking_id_idx" ON "signed_action_tokens"("booking_id");

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_host_user_id_fkey" FOREIGN KEY ("host_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "date_overrides" ADD CONSTRAINT "date_overrides_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_types" ADD CONSTRAINT "event_types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_types" ADD CONSTRAINT "event_types_host_user_id_fkey" FOREIGN KEY ("host_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_types" ADD CONSTRAINT "event_types_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_event_type_id_fkey" FOREIGN KEY ("event_type_id") REFERENCES "event_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_host_user_id_fkey" FOREIGN KEY ("host_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
