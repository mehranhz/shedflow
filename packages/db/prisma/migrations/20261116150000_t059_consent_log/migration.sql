-- T-059: append-only privacy consent log.
-- UPDATE is rejected so a later opt-out cannot rewrite an earlier grant.
-- DELETE stays available for user/org cascade when the account row itself is removed.

CREATE TABLE "consent_logs" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "organization_id" UUID,
  "purpose" TEXT NOT NULL,
  "granted" BOOLEAN NOT NULL,
  "consented_at" TIMESTAMPTZ(3) NOT NULL,
  "ip" TEXT,
  "user_agent" TEXT,
  "source" TEXT NOT NULL DEFAULT 'portal',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "consent_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "consent_logs_user_id_purpose_consented_at_idx"
  ON "consent_logs"("user_id", "purpose", "consented_at");

ALTER TABLE "consent_logs"
  ADD CONSTRAINT "consent_logs_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "consent_logs"
  ADD CONSTRAINT "consent_logs_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION consent_logs_reject_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'consent_logs is append-only';
END;
$$;

CREATE TRIGGER consent_logs_no_update
BEFORE UPDATE ON "consent_logs"
FOR EACH ROW
EXECUTE FUNCTION consent_logs_reject_update();
