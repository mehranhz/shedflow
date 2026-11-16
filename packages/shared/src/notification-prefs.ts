/**
 * Customer notification preferences (T-057).
 *
 * Security mail (password reset, email claim, invitations) and booking
 * confirmations always send. Marketing stays off until an explicit opt-in.
 * Quiet hours use the preference IANA timezone and apply to reminders,
 * marketing, waitlist alerts, and messages. Receipt decisions, confirmations,
 * and security mail are not held for quiet hours.
 */

export type NotificationCategory =
  | 'security'
  | 'confirmation'
  | 'reminder'
  | 'marketing'
  | 'receipt'
  | 'waitlist'
  | 'message';

export type NotificationChannelName = 'email' | 'sms' | 'push';

export type NotificationPrefs = {
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

export type StoredNotificationPrefs = NotificationPrefs;

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  emailEnabled: true,
  smsEnabled: false,
  pushEnabled: false,
  remindersEnabled: true,
  marketingEnabled: false,
  receiptsEnabled: true,
  waitlistEnabled: true,
  messagesEnabled: true,
  quietHoursStart: null,
  quietHoursEnd: null,
  timezone: 'UTC',
};

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

const SECURITY_TEMPLATES = new Set([
  'verify-email',
  'reset-password',
  'invitation',
]);

const CONFIRMATION_TEMPLATES = new Set([
  'booking-confirmed-host',
  'booking-confirmed-invitee',
  'booking-pending-host',
  'booking-cancelled-host',
  'booking-cancelled-invitee',
  'booking-rescheduled-host',
  'booking-rescheduled-invitee',
  'payment-failed',
  'payment-failed-host',
]);

const QUIET_CATEGORIES = new Set<NotificationCategory>([
  'reminder',
  'marketing',
  'waitlist',
  'message',
]);

export function mergeNotificationPrefs(
  globalRow: StoredNotificationPrefs | null,
  orgRow: StoredNotificationPrefs | null,
): NotificationPrefs {
  return {
    ...DEFAULT_NOTIFICATION_PREFS,
    ...(globalRow ? pickStored(globalRow) : {}),
    ...(orgRow ? pickStored(orgRow) : {}),
  };
}

export function emailTemplateCategory(template: string): NotificationCategory {
  if (SECURITY_TEMPLATES.has(template) || template.startsWith('claim')) {
    return 'security';
  }
  if (template.startsWith('reminder-')) {
    return 'reminder';
  }
  if (template === 'payment-receipt') {
    return 'receipt';
  }
  if (template === 'waitlist-offer') {
    return 'waitlist';
  }
  if (template === 'support-message') {
    return 'message';
  }
  if (template === 'review-request') {
    return 'marketing';
  }
  if (CONFIRMATION_TEMPLATES.has(template)) {
    return 'confirmation';
  }
  // Unknown transactional mail still sends. Opt-out categories are explicit.
  return 'confirmation';
}

export function notificationAllowed(
  prefs: NotificationPrefs,
  input: {
    category: NotificationCategory;
    channel: NotificationChannelName;
    at?: Date;
  },
): boolean {
  if (input.category === 'security' || input.category === 'confirmation') {
    return true;
  }
  if (!channelEnabled(prefs, input.channel)) {
    return false;
  }
  if (!categoryEnabled(prefs, input.category)) {
    return false;
  }
  if (
    QUIET_CATEGORIES.has(input.category) &&
    isInQuietHours(prefs, input.at ?? new Date())
  ) {
    return false;
  }
  return true;
}

export function validateQuietHours(
  start: string | null,
  end: string | null,
): Record<string, string[]> | null {
  if (start == null && end == null) {
    return null;
  }
  if (start == null) {
    return { quietHoursStart: ['Set both quiet-hours bounds, or clear both'] };
  }
  if (end == null) {
    return { quietHoursEnd: ['Set both quiet-hours bounds, or clear both'] };
  }
  if (!HHMM.test(start)) {
    return { quietHoursStart: ['Use HH:mm in 24-hour time'] };
  }
  if (!HHMM.test(end)) {
    return { quietHoursEnd: ['Use HH:mm in 24-hour time'] };
  }
  if (start === end) {
    return { quietHoursEnd: ['Quiet hours need a start and end that differ'] };
  }
  return null;
}

export function isInQuietHours(prefs: NotificationPrefs, at: Date): boolean {
  const start = prefs.quietHoursStart;
  const end = prefs.quietHoursEnd;
  if (!start || !end || start === end) {
    return false;
  }
  if (!HHMM.test(start) || !HHMM.test(end)) {
    return false;
  }
  const current = localMinutes(at, prefs.timezone || 'UTC');
  if (current == null) {
    return false;
  }
  const startMin = clockMinutes(start);
  const endMin = clockMinutes(end);
  if (startMin < endMin) {
    return current >= startMin && current < endMin;
  }
  return current >= startMin || current < endMin;
}

function channelEnabled(
  prefs: NotificationPrefs,
  channel: NotificationChannelName,
): boolean {
  if (channel === 'email') return prefs.emailEnabled;
  if (channel === 'sms') return prefs.smsEnabled;
  return prefs.pushEnabled;
}

function categoryEnabled(
  prefs: NotificationPrefs,
  category: NotificationCategory,
): boolean {
  switch (category) {
    case 'reminder':
      return prefs.remindersEnabled;
    case 'marketing':
      return prefs.marketingEnabled;
    case 'receipt':
      return prefs.receiptsEnabled;
    case 'waitlist':
      return prefs.waitlistEnabled;
    case 'message':
      return prefs.messagesEnabled;
    default:
      return true;
  }
}

function pickStored(row: StoredNotificationPrefs): NotificationPrefs {
  return {
    emailEnabled: row.emailEnabled,
    smsEnabled: row.smsEnabled,
    pushEnabled: row.pushEnabled,
    remindersEnabled: row.remindersEnabled,
    marketingEnabled: row.marketingEnabled,
    receiptsEnabled: row.receiptsEnabled,
    waitlistEnabled: row.waitlistEnabled,
    messagesEnabled: row.messagesEnabled,
    quietHoursStart: row.quietHoursStart,
    quietHoursEnd: row.quietHoursEnd,
    timezone: row.timezone,
  };
}

function clockMinutes(hhmm: string): number {
  const [hour, minute] = hhmm.split(':');
  return Number(hour) * 60 + Number(minute);
}

function localMinutes(at: Date, timeZone: string): number | null {
  try {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    const parts = fmt.formatToParts(at);
    let hour = Number(parts.find((part) => part.type === 'hour')?.value);
    const minute = Number(parts.find((part) => part.type === 'minute')?.value);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
      return null;
    }
    if (hour === 24) {
      hour = 0;
    }
    return hour * 60 + minute;
  } catch {
    return null;
  }
}
