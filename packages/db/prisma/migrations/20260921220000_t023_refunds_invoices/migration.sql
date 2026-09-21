-- Additive only: do not redefine existing enums.

CREATE TABLE IF NOT EXISTS "refunds" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "stripe_refund_id" TEXT NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "invoices" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "customer_id" UUID,
    "stripe_invoice_id" TEXT NOT NULL,
    "amount_due_minor" INTEGER NOT NULL,
    "amount_paid_minor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" TEXT NOT NULL,
    "hosted_invoice_url" TEXT,
    "pdf_url" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "refunds_stripe_refund_id_key" ON "refunds"("stripe_refund_id");
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_stripe_invoice_id_key" ON "invoices"("stripe_invoice_id");
CREATE INDEX IF NOT EXISTS "invoices_organization_id_created_at_idx" ON "invoices"("organization_id", "created_at");

DO $$ BEGIN
  ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
