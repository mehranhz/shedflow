import { z } from 'zod';

export const OrgSettingsSchema = z
  .object({
    flags: z.array(z.string()).optional(),
    branding: z
      .object({
        hideSchedflowBadge: z.boolean().optional(),
      })
      .optional(),
    notifications: z
      .object({
        reminderHours: z.array(z.number()).optional(),
        smsEnabled: z.boolean().optional(),
      })
      .optional(),
    booking: z
      .object({
        allowReschedule: z.boolean().optional(),
        allowCancel: z.boolean().optional(),
      })
      .optional(),
  })
  .passthrough();

export type OrgSettings = z.infer<typeof OrgSettingsSchema>;
