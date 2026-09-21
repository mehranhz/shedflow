import { BadRequestException } from '@nestjs/common';
import { BookingStatus } from '@shedflow/db';
import { Clock } from '../common/clock/clock';
import { AvailabilityService } from './availability.service';

class FrozenClock extends Clock {
  constructor(private readonly frozen: Date) {
    super();
  }
  now(): Date {
    return this.frozen;
  }
}

describe('AvailabilityService', () => {
  const scheduleId = '11111111-1111-4111-8111-111111111111';
  const eventTypeId = '22222222-2222-4222-8222-222222222222';
  const orgId = '33333333-3333-4333-8333-333333333333';

  function buildService(now: Date, overrides: {
    rules?: Array<{ dayOfWeek: number; startMinute: number; endMinute: number }>;
    dateOverrides?: Array<{
      date: string;
      isUnavailable: boolean;
      startMinute: number | null;
      endMinute: number | null;
    }>;
    bookings?: Array<{
      startAt: Date;
      endAt: Date;
      bufferBeforeMinutes: number;
      bufferAfterMinutes: number;
    }>;
    eventPatch?: Record<string, unknown>;
    scheduleTz?: string;
  } = {}) {
    const eventTypes = {
      findBySlug: jest.fn().mockResolvedValue({
        id: eventTypeId,
        organizationId: orgId,
        hostUserId: 'host',
        scheduleId,
        slug: 'intro',
        isActive: true,
        durationMinutes: 30,
        slotIntervalMinutes: 30,
        minNoticeMinutes: 60,
        maxDaysAhead: 60,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        dailyCap: null,
        ...overrides.eventPatch,
      }),
      findInOrganization: jest.fn().mockResolvedValue(null),
    };
    const schedules = {
      findInOrganization: jest.fn().mockResolvedValue({
        id: scheduleId,
        organizationId: orgId,
        hostUserId: 'host',
        timezone: overrides.scheduleTz ?? 'America/New_York',
      }),
      listRules: jest.fn().mockResolvedValue(
        (overrides.rules ?? [{ dayOfWeek: 0, startMinute: 0, endMinute: 1440 }]).map(
          (rule, index) => ({ id: String(index), scheduleId, ...rule }),
        ),
      ),
      listOverrides: jest.fn().mockResolvedValue(
        (overrides.dateOverrides ?? []).map((item, index) => ({
          id: String(index),
          scheduleId,
          ...item,
        })),
      ),
    };
    const bookings = {
      listOccupiedForHost: jest.fn().mockResolvedValue(
        (overrides.bookings ?? []).map((item) => ({
          ...item,
          status: BookingStatus.CONFIRMED,
        })),
      ),
      countByEventTypeLocalDays: jest.fn().mockResolvedValue(new Map()),
    };

    const calendars = {
      listBusyForHost: jest.fn().mockResolvedValue([]),
      isConflictSyncStale: jest.fn().mockResolvedValue(false),
      liveFreeBusyMerge: jest.fn().mockResolvedValue([]),
    };

    return new AvailabilityService(
      new FrozenClock(now),
      eventTypes as never,
      schedules as never,
      bookings as never,
      calendars as never,
    );
  }

  it('rejects invalid invitee timezone', async () => {
    const service = buildService(new Date('2026-03-08T14:00:00.000Z'));
    await expect(
      service.listSlots({
        organizationId: orgId,
        eventTypeIdOrSlug: 'intro',
        rangeStart: new Date('2026-03-08T00:00:00.000Z'),
        rangeEnd: new Date('2026-03-09T00:00:00.000Z'),
        inviteeTimeZone: 'Not/AZone',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('skips spring-forward invalid local times', async () => {
    // 2026-03-08 America/New_York: 02:00 → 03:00
    const service = buildService(new Date('2026-03-07T12:00:00.000Z'), {
      rules: [{ dayOfWeek: 0, startMinute: 120, endMinute: 180 }], // 02:00–03:00 local
      scheduleTz: 'America/New_York',
      eventPatch: { minNoticeMinutes: 0, durationMinutes: 30, slotIntervalMinutes: 30 },
    });
    const result = await service.listSlots({
      organizationId: orgId,
      eventTypeIdOrSlug: 'intro',
      rangeStart: new Date('2026-03-08T00:00:00.000Z'),
      rangeEnd: new Date('2026-03-09T00:00:00.000Z'),
      inviteeTimeZone: 'America/New_York',
    });
    expect(result.slots).toEqual([]);
  });

  it('respects minNotice with frozen clock', async () => {
    const service = buildService(new Date('2026-09-14T14:10:00.000Z'), {
      rules: [{ dayOfWeek: 1, startMinute: 540, endMinute: 1020 }],
      scheduleTz: 'UTC',
      eventPatch: {
        minNoticeMinutes: 60,
        durationMinutes: 30,
        slotIntervalMinutes: 30,
      },
    });
    const result = await service.listSlots({
      organizationId: orgId,
      eventTypeIdOrSlug: 'intro',
      rangeStart: new Date('2026-09-14T00:00:00.000Z'),
      rangeEnd: new Date('2026-09-15T00:00:00.000Z'),
      inviteeTimeZone: 'UTC',
    });
    expect(result.slots[0]?.startAt).toBe('2026-09-14T15:30:00.000Z');
  });

  it('formats slots in Asia/Kolkata', async () => {
    const service = buildService(new Date('2026-09-13T00:00:00.000Z'), {
      rules: [{ dayOfWeek: 1, startMinute: 540, endMinute: 600 }],
      scheduleTz: 'UTC',
      eventPatch: { minNoticeMinutes: 0, durationMinutes: 30, slotIntervalMinutes: 30 },
    });
    const result = await service.listSlots({
      organizationId: orgId,
      eventTypeIdOrSlug: 'intro',
      rangeStart: new Date('2026-09-14T00:00:00.000Z'),
      rangeEnd: new Date('2026-09-15T00:00:00.000Z'),
      inviteeTimeZone: 'Asia/Kolkata',
    });
    expect(result.slots[0]?.startLocal).toContain('+05:30');
  });

  it('hides unavailable override dates', async () => {
    const service = buildService(new Date('2026-09-13T00:00:00.000Z'), {
      rules: [{ dayOfWeek: 1, startMinute: 540, endMinute: 600 }],
      scheduleTz: 'UTC',
      dateOverrides: [
        {
          date: '2026-09-14',
          isUnavailable: true,
          startMinute: null,
          endMinute: null,
        },
      ],
      eventPatch: { minNoticeMinutes: 0, durationMinutes: 30, slotIntervalMinutes: 30 },
    });
    const result = await service.listSlots({
      organizationId: orgId,
      eventTypeIdOrSlug: 'intro',
      rangeStart: new Date('2026-09-14T00:00:00.000Z'),
      rangeEnd: new Date('2026-09-15T00:00:00.000Z'),
      inviteeTimeZone: 'UTC',
    });
    expect(result.slots).toEqual([]);
  });

  it('sets truncated when capping at 500 slots', async () => {
    const service = buildService(new Date('2026-01-01T00:00:00.000Z'), {
      rules: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
        dayOfWeek,
        startMinute: 0,
        endMinute: 1440,
      })),
      scheduleTz: 'UTC',
      eventPatch: {
        minNoticeMinutes: 0,
        durationMinutes: 15,
        slotIntervalMinutes: 15,
        maxDaysAhead: 60,
      },
    });
    const result = await service.listSlots({
      organizationId: orgId,
      eventTypeIdOrSlug: 'intro',
      rangeStart: new Date('2026-01-01T00:00:00.000Z'),
      rangeEnd: new Date('2026-01-20T00:00:00.000Z'),
      inviteeTimeZone: 'UTC',
    });
    expect(result.truncated).toBe(true);
    expect(result.slots).toHaveLength(500);
  });
});
