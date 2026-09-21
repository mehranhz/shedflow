import { config } from 'dotenv';
import { resolve } from 'node:path';
import { defineConfig } from 'prisma/config';

config({ path: resolve(__dirname, '../../.env') });
config({ path: resolve(__dirname, '.env') });

// `process.env` rather than prisma's `env()` helper: every CLI command loads this
// file, and `env()` would make DATABASE_URL-less commands such as `prisma generate` fail.
// Migrations prefer DIRECT_DATABASE_URL (non-pooled); locally it matches DATABASE_URL.
// PRISMA_MIGRATE_URL is an e2e override: Prisma's dotenvx loader would otherwise
// replace DATABASE_URL from `.env` and migrate the dev database.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url:
      process.env.PRISMA_MIGRATE_URL ??
      process.env.DIRECT_DATABASE_URL ??
      process.env.DATABASE_URL,
    // Only needed when the migration user cannot create databases, e.g. on hosted Postgres.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
