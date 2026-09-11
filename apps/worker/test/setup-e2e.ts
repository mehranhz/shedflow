import { config } from 'dotenv';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../../../.env') });
config({ path: resolve(__dirname, '../../.env') });
config({ path: resolve(__dirname, '../.env') });

const dbPackageRoot = resolve(__dirname, '../../../packages/db');
const requireFromDb = createRequire(resolve(dbPackageRoot, 'package.json'));
const prismaCli = requireFromDb.resolve('prisma/build/index.js');

export default function globalSetup(): void {
  const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

  if (databaseUrl) {
    process.env.DATABASE_URL = databaseUrl;
    process.env.DIRECT_DATABASE_URL = databaseUrl;
    process.env.PRISMA_MIGRATE_URL = databaseUrl;
  }

  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: dbPackageRoot,
    stdio: 'inherit',
    env: process.env,
  });
}
