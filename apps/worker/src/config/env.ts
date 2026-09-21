import { z } from 'zod';

export const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  INTERNAL_API_SECRET: z.string().min(1).default('change-me-in-development'),
  // Shared repo .env sets PORT=3001 for the API, so the worker binds WORKER_PORT.
  WORKER_PORT: z.coerce.number().int().positive().default(3003),
  OUTBOX_BACKOFF_MS: z.coerce.number().int().nonnegative().default(1000),
  OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().positive().default(10),
  OUTBOX_RELAY_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  // pg-boss rejects polling intervals below 0.5s.
  OUTBOX_POLLING_INTERVAL_SECONDS: z.coerce.number().min(0.5).default(1),
  APP_URL: z.string().url().default('http://localhost:3000'),
  API_URL: z.string().url().default('http://localhost:3001'),
  EMAIL_FROM: z
    .string()
    .min(1)
    .default('SchedFlow <notifications@mail.schedflow.com>'),
  // Optional — when unset, LoggingMailer records SENT without calling Resend.
  RESEND_API_KEY: z.string().optional(),
  ENCRYPTION_KEY: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_WEBHOOK_URL: z.string().url().optional(),
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
    OUTBOX_POLLING_INTERVAL_SECONDS: config.OUTBOX_POLLING_INTERVAL_SECONDS,
    APP_URL: config.APP_URL,
    API_URL: config.API_URL,
    EMAIL_FROM: config.EMAIL_FROM,
    RESEND_API_KEY: config.RESEND_API_KEY,
    ENCRYPTION_KEY: config.ENCRYPTION_KEY,
    GOOGLE_CLIENT_ID: config.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: config.GOOGLE_CLIENT_SECRET,
    GOOGLE_WEBHOOK_URL: config.GOOGLE_WEBHOOK_URL,
  });

  return { ...config, ...parsed };
}
