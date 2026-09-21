import { z } from 'zod';

export const envSchema = z.object({
  JWT_SECRET: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url().default('http://localhost:3000'),
  API_URL: z.string().url().default('http://localhost:3001'),
  BILLING_URL: z.string().url().default('http://localhost:3002'),
  PORT: z.coerce.number().int().positive().default(3001),
  INTERNAL_API_SECRET: z.string().min(1).default('change-me-in-development'),
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
    JWT_SECRET: config.JWT_SECRET,
    DATABASE_URL: config.DATABASE_URL,
    APP_URL: config.APP_URL,
    API_URL: config.API_URL,
    BILLING_URL: config.BILLING_URL,
    PORT: config.PORT,
    INTERNAL_API_SECRET: config.INTERNAL_API_SECRET,
    ENCRYPTION_KEY: config.ENCRYPTION_KEY,
    GOOGLE_CLIENT_ID: config.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: config.GOOGLE_CLIENT_SECRET,
    GOOGLE_WEBHOOK_URL: config.GOOGLE_WEBHOOK_URL,
  });

  return { ...config, ...parsed };
}
