import { z } from 'zod';

const phoneField = z
  .string()
  .min(3)
  .max(32)
  .refine((value) => !value.includes('@'), 'Phone is required');

export const RegisterSchema = z.object({
  username: phoneField,
  password: z.string().min(8),
  name: z.string().min(1).max(120).optional(),
  organizationName: z.string().min(1).max(100).optional(),
  timezone: z.string().min(1).optional(),
});

export const LoginSchema = z
  .object({
    username: phoneField.optional(),
    phone: phoneField.optional(),
    password: z.string().min(8),
  })
  .refine((value) => Boolean(value.username || value.phone), {
    message: 'Phone is required',
  });

export const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
  organizationId: z.string().uuid().optional(),
});

export const ForgotPasswordSchema = z.object({
  phone: phoneField,
});

export const ResetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});

export const VerifyEmailSchema = z.object({
  token: z.string().min(1),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type RefreshInput = z.infer<typeof RefreshSchema>;
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;
export type VerifyEmailInput = z.infer<typeof VerifyEmailSchema>;
