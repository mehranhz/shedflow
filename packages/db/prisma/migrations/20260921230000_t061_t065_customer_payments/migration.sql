-- Wave 13 T-061…T-065: customer payments, packages, gift cards.
-- Also adds customers.user_id (Wave 9 owns claim/login; additive for payment scoping).

-- ProductType.PACKAGE
DO $$ BEGIN
  ALTER TYPE "ProductType" ADD VALUE IF NOT EXISTS 'PACKAGE';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreditReason extras
DO $$ BEGIN
  ALTER TYPE "CreditReason" ADD VALUE IF NOT EXISTS 'PACKAGE_GRANT';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "CreditReason" ADD VALUE IF NOT EXISTS 'GIFT_REDEEM';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- customers.user_id (idempotent; Wave 9 may also migrate this)
DO $$ BEGIN
  ALTER TABLE "customers" ADD COLUMN "user_id" UUID;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "customers_user_id_idx" ON "customers"("user_id");

DO $$ BEGIN
  CREATE UNIQUE INDEX "customers_organization_id_user_id_key" ON "customers"("organization_id", "user_id");
EXCEPTION
  WHEN duplicate_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "customers" ADD CONSTRAINT "customers_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "GiftCardStatus" AS ENUM ('ACTIVE', 'REDEEMED', 'DISABLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "package_purchases_t064" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "payment_id" UUID,
    "credits_total" INTEGER NOT NULL,
    "credits_remaining" INTEGER NOT NULL,
    "expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "package_purchases_t064_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "package_purchases_t064_organization_id_customer_id_idx"
  ON "package_purchases_t064"("organization_id", "customer_id");
CREATE INDEX IF NOT EXISTS "package_purchases_t064_payment_id_idx"
  ON "package_purchases_t064"("payment_id");

CREATE TABLE IF NOT EXISTS "gift_cards_t065" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "code_prefix" VARCHAR(8) NOT NULL,
    "credit_amount" INTEGER NOT NULL,
    "status" "GiftCardStatus" NOT NULL DEFAULT 'ACTIVE',
    "redeemed_by_customer_id" UUID,
    "redeemed_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gift_cards_t065_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "gift_cards_t065_organization_id_code_hash_key"
  ON "gift_cards_t065"("organization_id", "code_hash");
CREATE INDEX IF NOT EXISTS "gift_cards_t065_organization_id_status_idx"
  ON "gift_cards_t065"("organization_id", "status");
