import { DOMAIN_EVENTS } from '@shedflow/shared';
import {
  CALENDAR_FULL_SYNC_QUEUE,
  CALENDAR_INCREMENTAL_SYNC_QUEUE,
  CALENDAR_WRITE_QUEUE,
} from '../calendar/calendar.constants';
import { EventSideEffectsService } from './event-side-effects.service';

jest.mock('../queue/pg-boss.service', () => ({
  PgBossService: class PgBossService {},
}));

describe('EventSideEffectsService calendar', () => {
  function create() {
    const prisma = {
      booking: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'bk-1',
          status: 'CONFIRMED',
          startAt: new Date('2030-06-01T15:00:00.000Z'),
        }),
      },
    };
    const reminders = {
      scheduleForBooking: jest.fn().mockResolvedValue(['reminder-24h']),
    };
    const expire = { scheduleIfNeeded: jest.fn() };
    const boss = {
      enqueueJob: jest.fn().mockResolvedValue('job-1'),
    };
    const service = new EventSideEffectsService(
      prisma as never,
      reminders as never,
      expire as never,
      boss as never,
    );
    return { service, boss, reminders };
  }

  it('enqueues calendar.write on booking.confirmed', async () => {
    const { service, boss } = create();
    await service.afterDomainEvent({
      eventId: 'e1',
      type: DOMAIN_EVENTS.BookingConfirmed,
      organizationId: 'org',
      payload: { bookingId: 'bk-1' },
      attempts: 0,
    });
    expect(boss.enqueueJob).toHaveBeenCalledWith(
      CALENDAR_WRITE_QUEUE,
      { bookingId: 'bk-1', action: 'upsert' },
      expect.objectContaining({ singletonKey: expect.stringContaining('bk-1') }),
    );
  });

  it('enqueues full_sync on calendar.connection_ready', async () => {
    const { service, boss } = create();
    await service.afterDomainEvent({
      eventId: 'e2',
      type: DOMAIN_EVENTS.CalendarConnectionReady,
      organizationId: 'org',
      payload: { connectionId: 'conn-1' },
      attempts: 0,
    });
    expect(boss.enqueueJob).toHaveBeenCalledWith(
      CALENDAR_FULL_SYNC_QUEUE,
      { connectionId: 'conn-1' },
      expect.objectContaining({ singletonKey: 'conn:conn-1' }),
    );
  });

  it('enqueues incremental_sync when payload.incremental', async () => {
    const { service, boss } = create();
    await service.afterDomainEvent({
      eventId: 'e3',
      type: DOMAIN_EVENTS.CalendarConnectionReady,
      organizationId: 'org',
      payload: { connectionId: 'conn-2', incremental: true },
      attempts: 0,
    });
    expect(boss.enqueueJob).toHaveBeenCalledWith(
      CALENDAR_INCREMENTAL_SYNC_QUEUE,
      { connectionId: 'conn-2' },
      expect.objectContaining({ singletonKey: 'conn:conn-2' }),
    );
  });
});
