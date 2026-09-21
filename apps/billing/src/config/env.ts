import { z } from 'zod';

export const envSchema = z.object({
  JWT_SECRET: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url().default('http://localhost:3000'),
  BILLING_URL: z.string().url().default('http://localhost:3002'),
  BILLING_PORT: z.coerce.number().int().positive().default(3002),
  API_URL: z.string().url().default('http://localhost:3001'),
  INTERNAL_API_SECRET: z.string().min(1).default('change-me-in-development'),
  STRIPE_SECRET_KEY: z.string().min(1).default('sk_test_placeholder'),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).default('whsec_placeholder'),
  STRIPE_CONNECT_WEBHOOK_SECRET: z
    .string()
    .min(1)
    .default('whsec_placeholder'),
  STRIPE_PLATFORM_FEE_BPS: z.coerce.number().int().nonnegative().default(200),
  STRIPE_PRICE_PRO_MONTHLY: z.string().min(1).optional(),
  STRIPE_PRICE_PRO_YEARLY: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const parsed = envSchema.parse({
    JWT_SECRET: config.JWT_SECRET,
    DATABASE_URL: config.DATABASE_URL,
    APP_URL: config.APP_URL,
    BILLING_URL: config.BILLING_URL,
    BILLING_PORT: config.BILLING_PORT,
    API_URL: config.API_URL,
    INTERNAL_API_SECRET: config.INTERNAL_API_SECRET,
    STRIPE_SECRET_KEY: config.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: config.STRIPE_WEBHOOK_SECRET,
    STRIPE_CONNECT_WEBHOOK_SECRET: config.STRIPE_CONNECT_WEBHOOK_SECRET,
    STRIPE_PLATFORM_FEE_BPS: config.STRIPE_PLATFORM_FEE_BPS,
    STRIPE_PRICE_PRO_MONTHLY: config.STRIPE_PRICE_PRO_MONTHLY,
    STRIPE_PRICE_PRO_YEARLY: config.STRIPE_PRICE_PRO_YEARLY,
  });

  return { ...config, ...parsed };
}
