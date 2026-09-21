import type { BusyBlock } from './calendar-provider';

/** Subset of Microsoft Graph event fields we care about. */
export type MicrosoftGraphEvent = {
  id?: string;
  '@removed'?: { reason?: string };
  isCancelled?: boolean;
  showAs?: string;
  isAllDay?: boolean;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
};

/**
 * Map Graph events → busy blocks.
 * - ignore cancelled / @removed
 * - showAs=free → not busy
 * - tentative / busy / oof / workingElsewhere = busy
 * - all-day = busy
 */
export function mapMicrosoftEventsToBusy(
  events: MicrosoftGraphEvent[],
): BusyBlock[] {
  const busy: BusyBlock[] = [];
  for (const event of events) {
    if (!event.id) {
      continue;
    }
    if (event['@removed'] || event.isCancelled) {
      continue;
    }
    if ((event.showAs ?? 'busy').toLowerCase() === 'free') {
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
    });
  }
  return busy;
}

export function microsoftDeletedEventIds(
  events: MicrosoftGraphEvent[],
): string[] {
  const ids: string[] = [];
  for (const event of events) {
    if (!event.id) continue;
    if (event['@removed'] || event.isCancelled) {
      ids.push(event.id);
    }
  }
  return ids;
}

function parseEventRange(
  event: MicrosoftGraphEvent,
): { start: Date; end: Date } | null {
  const startRaw = event.start?.dateTime ?? event.start?.date;
  const endRaw = event.end?.dateTime ?? event.end?.date;
  if (!startRaw || !endRaw) {
    return null;
  }

  // All-day: Graph uses date-only; treat as UTC midnight span (end exclusive).
  if (event.isAllDay || (!event.start?.dateTime && event.start?.date)) {
    const startDate = (event.start?.date ?? startRaw).slice(0, 10);
    const endDate = (event.end?.date ?? endRaw).slice(0, 10);
    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);
    if (!(end.getTime() > start.getTime())) {
      return null;
    }
    return { start, end };
  }

  // Graph dateTime often omits Z — treat as UTC when no offset.
  const start = parseGraphDateTime(startRaw);
  const end = parseGraphDateTime(endRaw);
  if (!start || !end) {
    return null;
  }
  if (!(end.getTime() > start.getTime())) {
    return null;
  }
  return { start, end };
}

function parseGraphDateTime(raw: string): Date | null {
  const normalized =
    /Z$|[+-]\d{2}:\d{2}$/.test(raw) || raw.includes('T') === false
      ? raw
      : `${raw}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}
