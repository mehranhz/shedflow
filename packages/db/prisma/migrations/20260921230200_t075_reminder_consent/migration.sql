-- T-075 SMS consent, notification prefs port, push subscriptions; PUSH channel

ALTER TYPE "NotificationChannel" ADD VALUE IF NOT EXISTS 'PUSH';

CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "organization_id" UUID,
    "email_enabled" BOOLEAN NOT NULL DEFAULT true,
    "sms_enabled" BOOLEAN NOT NULL DEFAULT false,
    "push_enabled" BOOLEAN NOT NULL DEFAULT false,
    "reminders_enabled" BOOLEAN NOT NULL DEFAULT true,
    "marketing_enabled" BOOLEAN NOT NULL DEFAULT false,
    "receipts_enabled" BOOLEAN NOT NULL DEFAULT true,
    "quiet_hours_start" TEXT,
    "quiet_hours_end" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sms_consents" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "consented_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "ip" TEXT,
    "user_agent" TEXT,
    "source" TEXT NOT NULL DEFAULT 'portal',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sms_consents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "push_subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),
    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- Global prefs: one row per user where organization_id IS NULL
CREATE UNIQUE INDEX "notification_preferences_user_id_org_unique"
  ON "notification_preferences" ("user_id", "organization_id")
  NULLS NOT DISTINCT;

CREATE INDEX "notification_preferences_user_id_idx" ON "notification_preferences"("user_id");
CREATE INDEX "sms_consents_user_id_revoked_at_idx" ON "sms_consents"("user_id", "revoked_at");
CREATE UNIQUE INDEX "push_subscriptions_user_id_endpoint_key" ON "push_subscriptions"("user_id", "endpoint");
CREATE INDEX "push_subscriptions_user_id_revoked_at_idx" ON "push_subscriptions"("user_id", "revoked_at");

ALTER TABLE "notification_preferences"
  ADD CONSTRAINT "notification_preferences_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_preferences"
  ADD CONSTRAINT "notification_preferences_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sms_consents"
  ADD CONSTRAINT "sms_consents_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "push_subscriptions"
  ADD CONSTRAINT "push_subscriptions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
