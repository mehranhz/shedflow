-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "notification_logs" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "booking_id" UUID,
    "channel" "NotificationChannel" NOT NULL,
    "template" TEXT NOT NULL,
    "to_address" TEXT NOT NULL,
    "provider_id" TEXT,
    "status" "NotificationStatus" NOT NULL,
    "error" TEXT,
    "sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_logs_booking_id_template_idx" ON "notification_logs"("booking_id", "template");

-- CreateIndex
CREATE INDEX "notification_logs_organization_id_created_at_idx" ON "notification_logs"("organization_id", "created_at");

-- Partial unique: idempotent booking emails (NULLs excluded so auth emails may repeat)
CREATE UNIQUE INDEX "notification_logs_booking_template_channel_uidx"
  ON "notification_logs" ("booking_id", "template", "channel")
  WHERE "booking_id" IS NOT NULL;
