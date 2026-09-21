import { buildIcs, bookingIcsUid } from './ics';

describe('ics', () => {
  it('uses booking.uid@schedflow.com as UID', () => {
    const uid = 'bk_abc123';
    const ics = buildIcs({
      uid,
      method: 'REQUEST',
      sequence: 0,
      summary: 'Intro call',
      startAt: new Date('2026-10-01T15:00:00.000Z'),
      endAt: new Date('2026-10-01T15:30:00.000Z'),
      organizerEmail: 'host@example.com',
      organizerName: 'Host',
      attendeeEmail: 'guest@example.com',
      attendeeName: 'Guest',
      location: 'Zoom',
    });
    expect(bookingIcsUid(uid)).toBe('bk_abc123@schedflow.com');
    expect(ics).toContain('UID:bk_abc123@schedflow.com');
    expect(ics).toContain('METHOD:REQUEST');
    expect(ics).toContain('ORGANIZER');
    expect(ics).toContain('ATTENDEE');
    expect(ics).toContain('DTSTART:20261001T150000Z');
    expect(ics).toContain('DTEND:20261001T153000Z');
  });

  it('uses METHOD:CANCEL for cancellations', () => {
    const ics = buildIcs({
      uid: 'bk_x',
      method: 'CANCEL',
      sequence: 2,
      summary: 'Intro call',
      startAt: new Date('2026-10-01T15:00:00.000Z'),
      endAt: new Date('2026-10-01T15:30:00.000Z'),
      organizerEmail: 'host@example.com',
      attendeeEmail: 'guest@example.com',
    });
    expect(ics).toContain('METHOD:CANCEL');
    expect(ics).toContain('STATUS:CANCELLED');
    expect(ics).toContain('SEQUENCE:2');
  });
});
