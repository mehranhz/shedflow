-- Wave 11 T-053: nullable series id so recurring UI can stay off without a backfill.
ALTER TABLE "bookings" ADD COLUMN "series_id" UUID;

CREATE INDEX "bookings_series_id_idx" ON "bookings"("series_id");
