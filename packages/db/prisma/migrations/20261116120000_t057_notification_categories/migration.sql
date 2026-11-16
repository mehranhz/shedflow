-- T-057: waitlist alerts and messages sit beside reminders, marketing, and receipts.
ALTER TABLE "notification_preferences"
  ADD COLUMN IF NOT EXISTS "waitlist_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "messages_enabled" BOOLEAN NOT NULL DEFAULT true;
