export const REMINDER_SEND_QUEUE = 'reminder.send';
export const BOOKING_EXPIRE_QUEUE = 'booking.expire';
export const IDEMPOTENCY_PURGE_QUEUE = 'idempotency.purge';

export const REMINDER_24H_MS = 24 * 60 * 60 * 1000;
export const REMINDER_1H_MS = 60 * 60 * 1000;

export type ReminderTemplate = 'reminder-24h' | 'reminder-1h';

export type ReminderJobPayload = {
  bookingId: string;
  template: ReminderTemplate;
  /** ISO startAt snapshot — job no-ops if booking.startAt differs. */
  startAt: string;
};

export type BookingExpireJobPayload = {
  bookingId: string;
};

export function reminderSingletonKey(
  bookingId: string,
  template: ReminderTemplate,
): string {
  return `reminder:${bookingId}:${template}`;
}

export function expireSingletonKey(bookingId: string): string {
  return `expire:${bookingId}`;
}

/**
 * Plan reminder jobs for a confirmed booking.
 * Skip 24h if startAt is within 24h; skip both if within 1h.
 */
export function planReminders(input: {
  bookingId: string;
  startAt: Date;
  now: Date;
}): Array<{ template: ReminderTemplate; startAfter: Date; payload: ReminderJobPayload }> {
  const startMs = input.startAt.getTime();
  const nowMs = input.now.getTime();
  const untilStart = startMs - nowMs;
  const startAtIso = input.startAt.toISOString();
  const planned: Array<{
    template: ReminderTemplate;
    startAfter: Date;
    payload: ReminderJobPayload;
  }> = [];

  if (untilStart > REMINDER_24H_MS) {
    planned.push({
      template: 'reminder-24h',
      startAfter: new Date(startMs - REMINDER_24H_MS),
      payload: {
        bookingId: input.bookingId,
        template: 'reminder-24h',
        startAt: startAtIso,
      },
    });
  }

  if (untilStart > REMINDER_1H_MS) {
    planned.push({
      template: 'reminder-1h',
      startAfter: new Date(startMs - REMINDER_1H_MS),
      payload: {
        bookingId: input.bookingId,
        template: 'reminder-1h',
        startAt: startAtIso,
      },
    });
  }

  return planned;
}
