export type BuildIcsInput = {
  uid: string;
  method: 'REQUEST' | 'CANCEL';
  sequence: number;
  summary: string;
  description?: string;
  startAt: Date;
  endAt: Date;
  organizerEmail: string;
  organizerName?: string | null;
  attendeeEmail: string;
  attendeeName?: string | null;
  location?: string | null;
};

/** UID format required by design: `{booking.uid}@schedflow.com`. */
export function bookingIcsUid(bookingUid: string): string {
  return `${bookingUid}@schedflow.com`;
}

function formatUtc(date: Date): string {
  const iso = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return iso.endsWith('Z') ? iso : `${iso}Z`;
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

export function buildIcs(input: BuildIcsInput): string {
  const uid = bookingIcsUid(input.uid);
  const stamp = formatUtc(new Date());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SchedFlow//EN',
    `METHOD:${input.method}`,
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${formatUtc(input.startAt)}`,
    `DTEND:${formatUtc(input.endAt)}`,
    `SUMMARY:${escapeText(input.summary)}`,
    `SEQUENCE:${input.sequence}`,
    `STATUS:${input.method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}`,
    `ORGANIZER;CN=${escapeText(input.organizerName?.trim() || input.organizerEmail)}:mailto:${input.organizerEmail}`,
    `ATTENDEE;CN=${escapeText(input.attendeeName?.trim() || input.attendeeEmail)};RSVP=TRUE:mailto:${input.attendeeEmail}`,
  ];
  if (input.description) {
    lines.push(`DESCRIPTION:${escapeText(input.description)}`);
  }
  if (input.location) {
    lines.push(`LOCATION:${escapeText(input.location)}`);
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}
