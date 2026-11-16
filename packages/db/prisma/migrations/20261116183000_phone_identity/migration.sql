-- Contact identity is a phone number. The users.email column stays as a hidden
-- synthetic mailbox (phone.<digits>@users.shedflow.invalid) for the unique constraint.
ALTER TABLE "invitations" RENAME COLUMN "email" TO "phone";
ALTER INDEX "invitations_organization_id_email_idx" RENAME TO "invitations_organization_id_phone_idx";

ALTER TABLE "customer_claim_tokens" RENAME COLUMN "email" TO "phone";
ALTER INDEX "customer_claim_tokens_email_idx" RENAME TO "customer_claim_tokens_phone_idx";

UPDATE "users"
SET "phone" = '+14155551000',
    "phone_verified_at" = COALESCE("phone_verified_at", NOW())
WHERE "email" = 'owner@shedflow.dev' AND "phone" IS NULL;

UPDATE "users"
SET "phone" = '+14155551001',
    "phone_verified_at" = COALESCE("phone_verified_at", NOW())
WHERE "email" = 'customer@shedflow.dev' AND "phone" IS NULL;

UPDATE "customers"
SET "phone" = '+14155551001'
WHERE "email" = 'customer@shedflow.dev' AND ("phone" IS NULL OR "phone" = '');
