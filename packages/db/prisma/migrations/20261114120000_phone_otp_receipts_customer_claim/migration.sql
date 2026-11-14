-- Phone login, booking OTP, bank-transfer receipts, and customer claim tokens.

CREATE TYPE "PaymentReceiptStatus" AS ENUM ('UPLOADED', 'APPROVED', 'REJECTED');

ALTER TABLE "users"
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "phone_verified_at" TIMESTAMPTZ(3);

CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

ALTER TABLE "event_types"
  ADD COLUMN "requires_payment_receipt" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "payment_instructions" TEXT;

CREATE TABLE "booking_payment_receipts" (
  "id" UUID NOT NULL,
  "booking_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "uploaded_by_user_id" UUID,
  "status" "PaymentReceiptStatus" NOT NULL DEFAULT 'UPLOADED',
  "storage_path" TEXT NOT NULL,
  "original_filename" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "rejection_reason" TEXT,
  "reviewed_at" TIMESTAMPTZ(3),
  "reviewed_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "booking_payment_receipts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "booking_payment_receipts_booking_id_created_at_idx"
  ON "booking_payment_receipts"("booking_id", "created_at");
CREATE INDEX "booking_payment_receipts_organization_id_idx"
  ON "booking_payment_receipts"("organization_id");

ALTER TABLE "booking_payment_receipts"
  ADD CONSTRAINT "booking_payment_receipts_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "otp_challenges" (
  "id" UUID NOT NULL,
  "username" TEXT NOT NULL,
  "code_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "used_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "otp_challenges_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "otp_challenges_username_created_at_idx"
  ON "otp_challenges"("username", "created_at");

CREATE TABLE "customer_claim_tokens" (
  "id" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "used_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_claim_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_claim_tokens_token_hash_key"
  ON "customer_claim_tokens"("token_hash");
CREATE INDEX "customer_claim_tokens_email_idx"
  ON "customer_claim_tokens"("email");
