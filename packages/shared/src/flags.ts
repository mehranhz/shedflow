import { PlatformPlan } from '@shedflow/db';

export const FEATURE_FLAGS = {
  outlookCalendar: 'outlook_calendar',
  sms: 'sms',
  embedV2: 'embed_v2',
} as const;

export type FeatureFlag = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS];

export const FEATURE_FLAG_VALUES: FeatureFlag[] = Object.values(FEATURE_FLAGS);

/**
 * T-038 lightweight flag check (full platform flags land later).
 * Enabled when present in env `FLAGS` (comma-separated) **or** `org.settings.flags`.
 */
export function isEnabled(
  flag: FeatureFlag | string,
  org?: { settings?: unknown; platformPlan?: PlatformPlan | string } | null,
  envFlags: string | undefined = process.env.FLAGS,
): boolean {
  const fromEnv = parseFlags(envFlags);
  if (fromEnv.has(flag)) {
    return true;
  }
  const settings = org?.settings;
  if (settings && typeof settings === 'object' && !Array.isArray(settings)) {
    const flags = (settings as { flags?: unknown }).flags;
    if (Array.isArray(flags) && flags.includes(flag)) {
      return true;
    }
  }
  return false;
}

/** Outlook calendar requires both the feature flag and a PRO platform plan. */
export function isOutlookCalendarEnabled(
  org: { settings?: unknown; platformPlan?: PlatformPlan | string } | null | undefined,
  envFlags: string | undefined = process.env.FLAGS,
): boolean {
  if (!org) {
    return false;
  }
  if (!isEnabled(FEATURE_FLAGS.outlookCalendar, org, envFlags)) {
    return false;
  }
  return org.platformPlan === PlatformPlan.PRO || org.platformPlan === 'PRO';
}

function parseFlags(raw: string | undefined): Set<string> {
  if (!raw?.trim()) {
    return new Set();
  }
  return new Set(
    raw
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean),
  );
}
