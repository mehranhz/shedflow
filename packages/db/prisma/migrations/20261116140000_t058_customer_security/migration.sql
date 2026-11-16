-- T-058: session last-used time, customer TOTP, and one-time backup codes.
ALTER TABLE "refresh_tokens"
  ADD COLUMN "last_used_at" TIMESTAMPTZ(3);

UPDATE "refresh_tokens"
  SET "last_used_at" = "created_at"
  WHERE "last_used_at" IS NULL;

ALTER TABLE "refresh_tokens"
  ALTER COLUMN "last_used_at" SET NOT NULL,
  ALTER COLUMN "last_used_at" SET DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "user_totp" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "pending_secret_ciphertext" TEXT,
  "secret_ciphertext" TEXT,
  "enabled_at" TIMESTAMPTZ(3),
  "failed_attempts" INTEGER NOT NULL DEFAULT 0,
  "window_started_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "user_totp_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_totp_user_id_key" ON "user_totp"("user_id");

ALTER TABLE "user_totp"
  ADD CONSTRAINT "user_totp_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "user_backup_codes" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "code_hash" TEXT NOT NULL,
  "used_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "user_backup_codes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "user_backup_codes_user_id_idx" ON "user_backup_codes"("user_id");

ALTER TABLE "user_backup_codes"
  ADD CONSTRAINT "user_backup_codes_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
