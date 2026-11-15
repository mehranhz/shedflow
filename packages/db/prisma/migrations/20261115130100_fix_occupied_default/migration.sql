-- 'empty' is not a tstzrange bound flag. Use the empty-range cast instead.
ALTER TABLE "bookings"
  ALTER COLUMN "occupied" SET DEFAULT 'empty'::tstzrange;
