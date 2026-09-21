import {
  mapGoogleEventsToBusy,
  type GoogleCalendarEvent,
} from './google-event-mapper';

describe('mapGoogleEventsToBusy', () => {
  it('maps timed events and treats tentative as busy', () => {
    const events: GoogleCalendarEvent[] = [
      {
        id: 'e1',
        status: 'tentative',
        start: { dateTime: '2030-01-15T10:00:00.000Z' },
        end: { dateTime: '2030-01-15T11:00:00.000Z' },
        etag: '"1"',
      },
    ];
    expect(mapGoogleEventsToBusy(events)).toEqual([
      {
        externalEventId: 'e1',
        etag: '"1"',
        start: new Date('2030-01-15T10:00:00.000Z'),
        end: new Date('2030-01-15T11:00:00.000Z'),
      },
    ]);
  });

  it('ignores transparent and cancelled events', () => {
    const events: GoogleCalendarEvent[] = [
      {
        id: 't',
        transparency: 'transparent',
        start: { dateTime: '2030-01-15T10:00:00.000Z' },
        end: { dateTime: '2030-01-15T11:00:00.000Z' },
      },
      {
        id: 'c',
        status: 'cancelled',
        start: { dateTime: '2030-01-15T12:00:00.000Z' },
        end: { dateTime: '2030-01-15T13:00:00.000Z' },
      },
    ];
    expect(mapGoogleEventsToBusy(events)).toEqual([]);
  });

  it('maps all-day events as busy (exclusive end date)', () => {
    const events: GoogleCalendarEvent[] = [
      {
        id: 'all',
        start: { date: '2030-06-01' },
        end: { date: '2030-06-02' },
      },
    ];
    expect(mapGoogleEventsToBusy(events)).toEqual([
      {
        externalEventId: 'all',
        etag: undefined,
        start: new Date('2030-06-01T00:00:00.000Z'),
        end: new Date('2030-06-02T00:00:00.000Z'),
      },
    ]);
  });
});
