import 'dotenv/config';
import { execFileSync } from 'node:child_process';

// Runs once before the e2e suite: point Prisma at the throwaway database and
// make sure its schema matches the committed migrations.
export default function globalSetup(): void {
  if (process.env.TEST_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  }

  execFileSync('prisma', ['migrate', 'deploy'], {
    stdio: 'inherit',
    env: process.env,
  });
}
