export const FEATURE_FLAGS = {
  outlookCalendar: 'outlook_calendar',
  sms: 'sms',
  embedV2: 'embed_v2',
} as const;

export type FeatureFlag = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS];

export const FEATURE_FLAG_VALUES: FeatureFlag[] = Object.values(FEATURE_FLAGS);
