export type BusyBlock = {
  start: Date;
  end: Date;
  externalEventId: string;
  etag?: string;
};

/** Subset of Google Calendar API event fields we care about. */
export type GoogleCalendarEvent = {
  id?: string;
  status?: string;
  transparency?: string;
  etag?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
};

/**
 * Map Google events → busy blocks.
 * - ignore transparent
 * - ignore cancelled
 * - tentative = busy
 * - all-day = busy (date-only → full UTC day span)
 */
export function mapGoogleEventsToBusy(
  events: GoogleCalendarEvent[],
): BusyBlock[] {
  const busy: BusyBlock[] = [];
  for (const event of events) {
    if (!event.id) {
      continue;
    }
    if (event.status === 'cancelled') {
      continue;
    }
    if (event.transparency === 'transparent') {
      continue;
    }
    const range = parseEventRange(event);
    if (!range) {
      continue;
    }
    busy.push({
      start: range.start,
      end: range.end,
      externalEventId: event.id,
      etag: event.etag,
    });
  }
  return busy;
}

function parseEventRange(
  event: GoogleCalendarEvent,
): { start: Date; end: Date } | null {
  const startRaw = event.start?.dateTime ?? event.start?.date;
  const endRaw = event.end?.dateTime ?? event.end?.date;
  if (!startRaw || !endRaw) {
    return null;
  }

  if (!event.start?.dateTime && event.start?.date) {
    const start = new Date(`${event.start.date}T00:00:00.000Z`);
    const end = new Date(`${event.end?.date ?? event.start.date}T00:00:00.000Z`);
    if (!(end.getTime() > start.getTime())) {
      return null;
    }
    return { start, end };
  }

  const start = new Date(startRaw);
  const end = new Date(endRaw);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }
  if (!(end.getTime() > start.getTime())) {
    return null;
  }
  return { start, end };
}
