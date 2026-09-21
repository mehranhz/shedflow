import { z } from 'zod';

export const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  INTERNAL_API_SECRET: z.string().min(1).default('change-me-in-development'),
  WORKER_PORT: z.coerce.number().int().positive().default(3003),
  OUTBOX_BACKOFF_MS: z.coerce.number().int().nonnegative().default(1000),
  OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().positive().default(10),
  OUTBOX_RELAY_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const parsed = envSchema.parse({
    DATABASE_URL: config.DATABASE_URL,
    INTERNAL_API_SECRET: config.INTERNAL_API_SECRET,
    WORKER_PORT: config.WORKER_PORT,
    OUTBOX_BACKOFF_MS: config.OUTBOX_BACKOFF_MS,
    OUTBOX_MAX_ATTEMPTS: config.OUTBOX_MAX_ATTEMPTS,
    OUTBOX_RELAY_INTERVAL_MS: config.OUTBOX_RELAY_INTERVAL_MS,
  });

  return { ...config, ...parsed };
}
