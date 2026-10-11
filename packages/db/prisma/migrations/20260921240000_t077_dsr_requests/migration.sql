-- Wave 16 T-077: GDPR DSR request audit table (additive only).
-- Customer.userId / engagement tables are owned by Waves 9–15.

DO $$ BEGIN
  CREATE TYPE "DsrRequestType" AS ENUM ('EXPORT', 'ERASE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DsrRequestStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "dsr_requests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "DsrRequestType" NOT NULL,
    "status" "DsrRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),
    "download_token_hash" TEXT,
    "download_expires_at" TIMESTAMPTZ(3),
    "result_payload" JSONB,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "dsr_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "dsr_requests_user_id_type_status_idx"
  ON "dsr_requests"("user_id", "type", "status");
CREATE INDEX IF NOT EXISTS "dsr_requests_download_token_hash_idx"
  ON "dsr_requests"("download_token_hash");

DO $$ BEGIN
  ALTER TABLE "dsr_requests"
    ADD CONSTRAINT "dsr_requests_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
