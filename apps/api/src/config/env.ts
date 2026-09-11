import { z } from 'zod';

export const envSchema = z.object({
  JWT_SECRET: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url().default('http://localhost:3000'),
  PORT: z.coerce.number().int().positive().default(3001),
  INTERNAL_API_SECRET: z.string().min(1).default('change-me-in-development'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const parsed = envSchema.parse({
    JWT_SECRET: config.JWT_SECRET,
    DATABASE_URL: config.DATABASE_URL,
    APP_URL: config.APP_URL,
    PORT: config.PORT,
    INTERNAL_API_SECRET: config.INTERNAL_API_SECRET,
  });

  return { ...config, ...parsed };
}
