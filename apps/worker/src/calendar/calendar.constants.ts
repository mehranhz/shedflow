export const CALENDAR_FULL_SYNC_QUEUE = 'calendar.full_sync';
export const CALENDAR_INCREMENTAL_SYNC_QUEUE = 'calendar.incremental_sync';
export const CALENDAR_WRITE_QUEUE = 'calendar.write';
export const CALENDAR_RENEW_WATCH_QUEUE = 'calendar.renew_watch';
export const CALENDAR_POLL_QUEUE = 'calendar.poll';

export type CalendarSyncJobPayload = {
  connectionId: string;
};

export type CalendarWriteAction = 'upsert' | 'delete';

export type CalendarWriteJobPayload = {
  bookingId: string;
  action: CalendarWriteAction;
};

export function calendarConnSingletonKey(connectionId: string): string {
  return `conn:${connectionId}`;
}

export function calendarWriteSingletonKey(
  bookingId: string,
  action: CalendarWriteAction,
): string {
  return `calwrite:${bookingId}:${action}`;
}
