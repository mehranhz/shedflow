export type NotificationPreference = {
  id: string;
  userId: string;
  organizationId: string | null;
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;
  remindersEnabled: boolean;
  marketingEnabled: boolean;
  receiptsEnabled: boolean;
  waitlistEnabled: boolean;
  messagesEnabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateNotificationPreferenceData = {
  userId: string;
  organizationId: string | null;
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;
  remindersEnabled: boolean;
  marketingEnabled: boolean;
  receiptsEnabled: boolean;
  waitlistEnabled: boolean;
  messagesEnabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  timezone: string;
};

export type UpdateNotificationPreferenceData = Partial<
  Omit<CreateNotificationPreferenceData, 'userId' | 'organizationId'>
>;
