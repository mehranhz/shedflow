-- Wave 14 T-066…T-072 customer engagement (additive)

CREATE TYPE "FavoriteKind" AS ENUM ('STAFF', 'SERVICE', 'LOCATION');
CREATE TYPE "WaitlistStatus" AS ENUM ('WAITING', 'OFFERED', 'CLAIMED', 'EXPIRED', 'CANCELLED');
CREATE TYPE "SupportSenderType" AS ENUM ('CUSTOMER', 'STAFF');

CREATE TABLE "customer_favorites" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "kind" "FavoriteKind" NOT NULL,
    "ref_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "customer_favorites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_favorites_organization_id_customer_id_kind_ref_id_key"
  ON "customer_favorites"("organization_id", "customer_id", "kind", "ref_id");
CREATE INDEX "customer_favorites_organization_id_customer_id_idx"
  ON "customer_favorites"("organization_id", "customer_id");

ALTER TABLE "customer_favorites"
  ADD CONSTRAINT "customer_favorites_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_favorites"
  ADD CONSTRAINT "customer_favorites_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "dependents" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "date_of_birth" DATE,
    "relationship" TEXT NOT NULL DEFAULT 'child',
    "notes" TEXT NOT NULL DEFAULT '',
    "guardian_attested_at" TIMESTAMPTZ(3),
    "display_name_snapshot" TEXT,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "dependents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "dependents_user_id_deleted_at_idx" ON "dependents"("user_id", "deleted_at");
ALTER TABLE "dependents"
  ADD CONSTRAINT "dependents_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "waitlist_entries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "event_type_id" UUID NOT NULL,
    "prefer_from" TIMESTAMPTZ(3),
    "prefer_to" TIMESTAMPTZ(3),
    "status" "WaitlistStatus" NOT NULL DEFAULT 'WAITING',
    "offered_slot_start" TIMESTAMPTZ(3),
    "offered_slot_end" TIMESTAMPTZ(3),
    "offer_expires_at" TIMESTAMPTZ(3),
    "claimed_booking_id" UUID,
    "source_booking_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "waitlist_entries_organization_id_event_type_id_status_created_at_idx"
  ON "waitlist_entries"("organization_id", "event_type_id", "status", "created_at");
CREATE INDEX "waitlist_entries_organization_id_customer_id_idx"
  ON "waitlist_entries"("organization_id", "customer_id");
CREATE INDEX "waitlist_entries_status_offer_expires_at_idx"
  ON "waitlist_entries"("status", "offer_expires_at");

ALTER TABLE "waitlist_entries"
  ADD CONSTRAINT "waitlist_entries_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "waitlist_entries"
  ADD CONSTRAINT "waitlist_entries_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "support_threads" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "booking_id" UUID,
    "subject" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "support_threads_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "support_threads_organization_id_customer_id_idx"
  ON "support_threads"("organization_id", "customer_id");
CREATE INDEX "support_threads_organization_id_booking_id_idx"
  ON "support_threads"("organization_id", "booking_id");

ALTER TABLE "support_threads"
  ADD CONSTRAINT "support_threads_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "support_threads"
  ADD CONSTRAINT "support_threads_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "support_messages" (
    "id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "sender_type" "SupportSenderType" NOT NULL,
    "sender_user_id" UUID,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "support_messages_thread_id_created_at_idx"
  ON "support_messages"("thread_id", "created_at");
CREATE INDEX "support_messages_organization_id_created_at_idx"
  ON "support_messages"("organization_id", "created_at");

ALTER TABLE "support_messages"
  ADD CONSTRAINT "support_messages_thread_id_fkey"
  FOREIGN KEY ("thread_id") REFERENCES "support_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "support_messages"
  ADD CONSTRAINT "support_messages_sender_user_id_fkey"
  FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "booking_reviews" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "hidden_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "booking_reviews_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "booking_reviews_booking_id_key" ON "booking_reviews"("booking_id");
CREATE INDEX "booking_reviews_organization_id_hidden_at_idx"
  ON "booking_reviews"("organization_id", "hidden_at");
CREATE INDEX "booking_reviews_organization_id_customer_id_idx"
  ON "booking_reviews"("organization_id", "customer_id");

ALTER TABLE "booking_reviews"
  ADD CONSTRAINT "booking_reviews_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "booking_reviews"
  ADD CONSTRAINT "booking_reviews_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "referral_codes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "referral_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "referral_codes_organization_id_customer_id_key"
  ON "referral_codes"("organization_id", "customer_id");
CREATE UNIQUE INDEX "referral_codes_organization_id_code_key"
  ON "referral_codes"("organization_id", "code");

ALTER TABLE "referral_codes"
  ADD CONSTRAINT "referral_codes_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "referral_codes"
  ADD CONSTRAINT "referral_codes_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "referral_attributions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "referrer_customer_id" UUID NOT NULL,
    "referee_customer_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "first_paid_booking_id" UUID,
    "awarded_at" TIMESTAMPTZ(3),
    "award_key" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "referral_attributions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "referral_attributions_award_key_key" ON "referral_attributions"("award_key");
CREATE UNIQUE INDEX "referral_attributions_organization_id_referee_customer_id_key"
  ON "referral_attributions"("organization_id", "referee_customer_id");
CREATE INDEX "referral_attributions_organization_id_referrer_customer_id_idx"
  ON "referral_attributions"("organization_id", "referrer_customer_id");

ALTER TABLE "referral_attributions"
  ADD CONSTRAINT "referral_attributions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "referral_attributions"
  ADD CONSTRAINT "referral_attributions_referrer_customer_id_fkey"
  FOREIGN KEY ("referrer_customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "referral_attributions"
  ADD CONSTRAINT "referral_attributions_referee_customer_id_fkey"
  FOREIGN KEY ("referee_customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "user_notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "organization_id" UUID,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "href" TEXT,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "user_notifications_user_id_created_at_idx"
  ON "user_notifications"("user_id", "created_at");
CREATE INDEX "user_notifications_user_id_read_at_idx"
  ON "user_notifications"("user_id", "read_at");

ALTER TABLE "user_notifications"
  ADD CONSTRAINT "user_notifications_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_notifications"
  ADD CONSTRAINT "user_notifications_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
