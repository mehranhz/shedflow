/*
  Warnings:

  - You are about to drop the column `occupied` on the `bookings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "bookings" DROP COLUMN "occupied";

-- RenameIndex
ALTER INDEX "credit_ledger_entries_organization_id_customer_id_created_at_id" RENAME TO "credit_ledger_entries_organization_id_customer_id_created_a_idx";

-- RenameIndex
ALTER INDEX "customer_calendar_connections_user_id_provider_account_email_ke" RENAME TO "customer_calendar_connections_user_id_provider_account_emai_key";

-- RenameIndex
ALTER INDEX "external_busy_blocks_connected_calendar_id_external_event_id_ke" RENAME TO "external_busy_blocks_connected_calendar_id_external_event_i_key";

-- RenameIndex
ALTER INDEX "notification_preferences_user_id_org_unique" RENAME TO "notification_preferences_user_id_organization_id_key";

-- RenameIndex
ALTER INDEX "waitlist_entries_organization_id_event_type_id_status_created_a" RENAME TO "waitlist_entries_organization_id_event_type_id_status_creat_idx";
