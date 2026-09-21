import {
  mapMicrosoftEventsToBusy,
  microsoftDeletedEventIds,
  type MicrosoftGraphEvent,
} from './microsoft-event-mapper';

describe('mapMicrosoftEventsToBusy', () => {
  it('maps timed events and treats tentative as busy', () => {
    const events: MicrosoftGraphEvent[] = [
      {
        id: 'e1',
        showAs: 'tentative',
        start: { dateTime: '2030-01-15T10:00:00.0000000' },
        end: { dateTime: '2030-01-15T11:00:00.0000000' },
      },
    ];
    expect(mapMicrosoftEventsToBusy(events)).toEqual([
      {
        externalEventId: 'e1',
        start: new Date('2030-01-15T10:00:00.000Z'),
        end: new Date('2030-01-15T11:00:00.000Z'),
      },
    ]);
  });

  it('ignores free and cancelled events', () => {
    const events: MicrosoftGraphEvent[] = [
      {
        id: 'f',
        showAs: 'free',
        start: { dateTime: '2030-01-15T10:00:00Z' },
        end: { dateTime: '2030-01-15T11:00:00Z' },
      },
      {
        id: 'c',
        isCancelled: true,
        start: { dateTime: '2030-01-15T12:00:00Z' },
        end: { dateTime: '2030-01-15T13:00:00Z' },
      },
    ];
    expect(mapMicrosoftEventsToBusy(events)).toEqual([]);
  });

  it('maps all-day events as busy', () => {
    const events: MicrosoftGraphEvent[] = [
      {
        id: 'all',
        isAllDay: true,
        start: { date: '2030-06-01' },
        end: { date: '2030-06-02' },
      },
    ];
    expect(mapMicrosoftEventsToBusy(events)).toEqual([
      {
        externalEventId: 'all',
        start: new Date('2030-06-01T00:00:00.000Z'),
        end: new Date('2030-06-02T00:00:00.000Z'),
      },
    ]);
  });

  it('collects deleted event ids from delta', () => {
    expect(
      microsoftDeletedEventIds([
        { id: 'gone', '@removed': { reason: 'deleted' } },
        { id: 'keep', showAs: 'busy' },
      ]),
    ).toEqual(['gone']);
  });
});
