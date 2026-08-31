import { config } from 'dotenv';
import { resolve } from 'node:path';
import { defineConfig } from 'prisma/config';

config({ path: resolve(__dirname, '../../.env') });
config({ path: resolve(__dirname, '.env') });

// `process.env` rather than prisma's `env()` helper: every CLI command loads this
// file, and `env()` would make DATABASE_URL-less commands such as `prisma generate` fail.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL,
    // Only needed when the migration user cannot create databases, e.g. on hosted Postgres.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
