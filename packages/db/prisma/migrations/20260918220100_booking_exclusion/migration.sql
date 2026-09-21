-- prisma-ignore
-- GiST exclusion: one confirmed/pending booking per host per overlapping occupied range.
-- Do not recreate this from `prisma db pull`; it is not representable in schema.prisma.
--
-- occupied cannot be a GENERATED STORED column: tstzrange/interval math is not IMMUTABLE
-- in PostgreSQL. Maintain it with a BEFORE INSERT/UPDATE trigger instead.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS occupied tstzrange;

CREATE OR REPLACE FUNCTION bookings_set_occupied()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.occupied := tstzrange(
    NEW.start_at - (NEW.buffer_before_minutes * INTERVAL '1 minute'),
    NEW.end_at   + (NEW.buffer_after_minutes * INTERVAL '1 minute'),
    '[)'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_set_occupied_trg ON bookings;
CREATE TRIGGER bookings_set_occupied_trg
  BEFORE INSERT OR UPDATE OF start_at, end_at, buffer_before_minutes, buffer_after_minutes
  ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION bookings_set_occupied();

-- Backfill any existing rows (none expected at first apply).
UPDATE bookings
SET occupied = tstzrange(
  start_at - (buffer_before_minutes * INTERVAL '1 minute'),
  end_at   + (buffer_after_minutes * INTERVAL '1 minute'),
  '[)'
)
WHERE occupied IS NULL;

ALTER TABLE bookings
  ALTER COLUMN occupied SET NOT NULL;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_host_occupied_excl
  EXCLUDE USING gist (
    host_user_id WITH =,
    occupied WITH &&
  )
  WHERE (status IN ('PENDING_PAYMENT', 'PENDING_CONFIRMATION', 'CONFIRMED'));

ALTER TABLE availability_rules
  ADD CONSTRAINT availability_rules_minutes_chk
  CHECK (start_minute >= 0 AND end_minute <= 1440 AND start_minute < end_minute);

ALTER TABLE date_overrides
  ADD CONSTRAINT date_overrides_minutes_chk
  CHECK (
    is_unavailable
    OR (start_minute IS NOT NULL AND end_minute IS NOT NULL
        AND start_minute >= 0 AND end_minute <= 1440 AND start_minute < end_minute)
  );

ALTER TABLE event_types
  ADD CONSTRAINT event_types_duration_chk
  CHECK (duration_minutes > 0 AND duration_minutes <= 24 * 60);

ALTER TABLE bookings
  ADD CONSTRAINT bookings_range_chk
  CHECK (end_at > start_at);
