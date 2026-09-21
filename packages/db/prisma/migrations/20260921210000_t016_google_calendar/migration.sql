-- CreateEnum
CREATE TYPE "CalendarProvider" AS ENUM ('GOOGLE', 'MICROSOFT');

-- CreateTable
CREATE TABLE "calendar_connections" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "CalendarProvider" NOT NULL,
    "account_email" TEXT NOT NULL,
    "access_token_enc" BYTEA NOT NULL,
    "refresh_token_enc" BYTEA NOT NULL,
    "token_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "scopes" TEXT[],
    "channel_id" TEXT,
    "resource_id" TEXT,
    "channel_expires_at" TIMESTAMPTZ(3),
    "sync_token" TEXT,
    "last_synced_at" TIMESTAMPTZ(3),
    "needs_reauth" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "calendar_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connected_calendars" (
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "external_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "conflict_check" BOOLEAN NOT NULL DEFAULT true,
    "write_target" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "connected_calendars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_busy_blocks" (
    "id" UUID NOT NULL,
    "connected_calendar_id" UUID NOT NULL,
    "host_user_id" UUID NOT NULL,
    "start_at" TIMESTAMPTZ(3) NOT NULL,
    "end_at" TIMESTAMPTZ(3) NOT NULL,
    "external_event_id" TEXT NOT NULL,
    "etag" TEXT,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "external_busy_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "calendar_connections_organization_id_idx" ON "calendar_connections"("organization_id");

-- CreateIndex
CREATE INDEX "calendar_connections_channel_id_idx" ON "calendar_connections"("channel_id");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_connections_user_id_provider_account_email_key" ON "calendar_connections"("user_id", "provider", "account_email");

-- CreateIndex
CREATE UNIQUE INDEX "connected_calendars_connection_id_external_id_key" ON "connected_calendars"("connection_id", "external_id");

-- CreateIndex
CREATE INDEX "external_busy_blocks_host_user_id_start_at_end_at_idx" ON "external_busy_blocks"("host_user_id", "start_at", "end_at");

-- CreateIndex
CREATE UNIQUE INDEX "external_busy_blocks_connected_calendar_id_external_event_id_key" ON "external_busy_blocks"("connected_calendar_id", "external_event_id");

-- AddForeignKey
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connected_calendars" ADD CONSTRAINT "connected_calendars_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "calendar_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_busy_blocks" ADD CONSTRAINT "external_busy_blocks_connected_calendar_id_fkey" FOREIGN KEY ("connected_calendar_id") REFERENCES "connected_calendars"("id") ON DELETE CASCADE ON UPDATE CASCADE;
