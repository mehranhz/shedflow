-- T-074 Customer calendar connections (separate from host calendar_connections)

CREATE TABLE "customer_calendar_connections" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "CalendarProvider" NOT NULL,
    "account_email" TEXT NOT NULL,
    "access_token_enc" BYTEA NOT NULL,
    "refresh_token_enc" BYTEA NOT NULL,
    "token_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "scopes" TEXT[],
    "calendar_external_id" TEXT,
    "needs_reauth" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "customer_calendar_connections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_calendar_events" (
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "external_event_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "customer_calendar_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_ics_feeds" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),
    CONSTRAINT "customer_ics_feeds_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_calendar_connections_user_id_provider_account_email_key"
  ON "customer_calendar_connections"("user_id", "provider", "account_email");
CREATE INDEX "customer_calendar_connections_user_id_idx" ON "customer_calendar_connections"("user_id");
CREATE UNIQUE INDEX "customer_calendar_events_connection_id_booking_id_key"
  ON "customer_calendar_events"("connection_id", "booking_id");
CREATE INDEX "customer_calendar_events_booking_id_idx" ON "customer_calendar_events"("booking_id");
CREATE UNIQUE INDEX "customer_ics_feeds_token_hash_key" ON "customer_ics_feeds"("token_hash");
CREATE INDEX "customer_ics_feeds_user_id_idx" ON "customer_ics_feeds"("user_id");

ALTER TABLE "customer_calendar_connections"
  ADD CONSTRAINT "customer_calendar_connections_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_calendar_events"
  ADD CONSTRAINT "customer_calendar_events_connection_id_fkey"
  FOREIGN KEY ("connection_id") REFERENCES "customer_calendar_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_calendar_events"
  ADD CONSTRAINT "customer_calendar_events_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_ics_feeds"
  ADD CONSTRAINT "customer_ics_feeds_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
