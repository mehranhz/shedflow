-- T-056: portal preference center lives on users.settings.portal.
ALTER TABLE "users" ADD COLUMN "settings" JSONB NOT NULL DEFAULT '{}';
