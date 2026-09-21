import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../../../.env') });
config({ path: resolve(__dirname, '../../.env') });
config({ path: resolve(__dirname, '../.env') });

process.env.INTERNAL_API_SECRET ??= 'test-internal-secret';
process.env.WORKER_PORT ??= '3003';
process.env.OUTBOX_BACKOFF_MS = '50';
process.env.OUTBOX_MAX_ATTEMPTS = '3';
process.env.OUTBOX_RELAY_INTERVAL_MS = '200';
process.env.OUTBOX_POLLING_INTERVAL_SECONDS = '0.5';
process.env.APP_URL ??= 'http://localhost:3000';
process.env.API_URL ??= 'http://localhost:3001';
process.env.EMAIL_FROM ??= 'SchedFlow <notifications@mail.schedflow.com>';
delete process.env.RESEND_API_KEY;
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
