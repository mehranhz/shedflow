-- 20260929113111 dropped `occupied` while the BEFORE INSERT trigger still writes it.
-- Restore the column and the host exclusion constraint. The trigger already exists.

ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "occupied" tstzrange;

UPDATE "bookings"
SET "occupied" = tstzrange(
  start_at - (buffer_before_minutes * INTERVAL '1 minute'),
  end_at + (buffer_after_minutes * INTERVAL '1 minute'),
  '[)'
)
WHERE "occupied" IS NULL;

ALTER TABLE "bookings"
  ALTER COLUMN "occupied" SET DEFAULT tstzrange(TIMESTAMP 'epoch', TIMESTAMP 'epoch', 'empty');

ALTER TABLE "bookings"
  ALTER COLUMN "occupied" SET NOT NULL;

ALTER TABLE "bookings"
  DROP CONSTRAINT IF EXISTS "bookings_host_occupied_excl";

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_host_occupied_excl"
  EXCLUDE USING gist (
    host_user_id WITH =,
    occupied WITH &&
  )
  WHERE (status IN ('PENDING_PAYMENT', 'PENDING_CONFIRMATION', 'CONFIRMED'));
