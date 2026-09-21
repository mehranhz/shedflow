import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { TZDate } from '@date-fns/tz';
import { addDays, addMinutes, startOfDay } from 'date-fns';
import { BookingStatus } from '@shedflow/db';
import { Clock } from '../common/clock/clock';
import { BookingRepository } from '../bookings/booking.repository';
import { EventTypeRepository } from '../event-types/event-type.repository';
import { ScheduleRepository } from '../schedules/schedule.repository';

export type ListSlotsInput = {
  organizationId: string;
  eventTypeIdOrSlug: string;
  rangeStart: Date;
  rangeEnd: Date;
  inviteeTimeZone: string;
};

export type SlotDto = {
  startAt: string;
  endAt: string;
  startLocal: string;
  endLocal: string;
};

export type SlotListResult = {
  timezone: string;
  stale: boolean;
  truncated: boolean;
  slots: SlotDto[];
};

const MAX_RANGE_DAYS = 31;
const MAX_SLOTS = 500;
const ACTIVE_STATUSES: BookingStatus[] = [
  BookingStatus.PENDING_PAYMENT,
  BookingStatus.PENDING_CONFIRMATION,
  BookingStatus.CONFIRMED,
];

type BusyInterval = { start: Date; end: Date };

@Injectable()
export class AvailabilityService {
  private readonly logger = new Logger(AvailabilityService.name);

  constructor(
    private readonly clock: Clock,
    private readonly eventTypes: EventTypeRepository,
    private readonly schedules: ScheduleRepository,
    private readonly bookings: BookingRepository,
  ) {}

  async listSlots(input: ListSlotsInput): Promise<SlotListResult> {
    if (!isUsableTimeZone(input.inviteeTimeZone)) {
      throw new BadRequestException({
        code: 'INVALID_TIMEZONE',
        message: 'Invalid IANA timezone',
      });
    }
    if (
      Number.isNaN(input.rangeStart.getTime()) ||
      Number.isNaN(input.rangeEnd.getTime())
    ) {
      throw new BadRequestException({
        fieldErrors: { from: ['Invalid from/to datetime'] },
      });
    }

    const rangeMs = input.rangeEnd.getTime() - input.rangeStart.getTime();
    if (rangeMs > MAX_RANGE_DAYS * 24 * 60 * 60 * 1000) {
      throw new BadRequestException({
        message: 'Range must be at most 31 days',
        fieldErrors: { to: ['Range must be at most 31 days'] },
      });
    }

    const eventType =
      (await this.eventTypes.findBySlug(
        input.organizationId,
        input.eventTypeIdOrSlug,
      )) ??
      (await this.eventTypes.findInOrganization(
        input.organizationId,
        input.eventTypeIdOrSlug,
      ));
    if (!eventType || !eventType.isActive) {
      throw new NotFoundException('Not found');
    }

    const schedule = await this.schedules.findInOrganization(
      input.organizationId,
      eventType.scheduleId,
    );
    if (!schedule) {
      throw new NotFoundException('Not found');
    }

    const now = this.clock.now();
    const minStart = addMinutes(now, eventType.minNoticeMinutes);
    let rangeStart =
      input.rangeStart.getTime() < minStart.getTime()
        ? minStart
        : input.rangeStart;

    const scheduleToday = startOfDay(new TZDate(now, schedule.timezone));
    const maxEnd = addDays(scheduleToday, eventType.maxDaysAhead);
    let rangeEnd =
      input.rangeEnd.getTime() > maxEnd.getTime() ? maxEnd : input.rangeEnd;

    if (rangeEnd.getTime() <= rangeStart.getTime()) {
      return {
        timezone: input.inviteeTimeZone,
        stale: false,
        truncated: false,
        slots: [],
      };
    }

    const [rules, overrides] = await Promise.all([
      this.schedules.listRules(schedule.id),
      this.schedules.listOverrides(schedule.id),
    ]);
    const overrideByDate = new Map(
      overrides.map((item) => [item.date, item] as const),
    );

    const padMs = Math.max(
      eventType.bufferBeforeMinutes,
      eventType.bufferAfterMinutes,
    ) *
      60 *
      1000;
    const busy = await this.loadBusy(
      eventType.hostUserId,
      new Date(rangeStart.getTime() - padMs),
      new Date(rangeEnd.getTime() + padMs),
    );

    const dailyCounts = await this.bookings.countByEventTypeLocalDays(
      eventType.id,
      schedule.timezone,
      rangeStart,
      rangeEnd,
      ACTIVE_STATUSES,
    );

    const stepMinutes =
      eventType.slotIntervalMinutes > 0
        ? eventType.slotIntervalMinutes
        : eventType.durationMinutes;
    const duration = eventType.durationMinutes;
    const slots: SlotDto[] = [];
    let truncated = false;

    const localStart = new TZDate(rangeStart, schedule.timezone);
    const localEnd = new TZDate(rangeEnd, schedule.timezone);
    let cursor = startOfDay(localStart);

    while (cursor.getTime() < localEnd.getTime() || sameLocalDate(cursor, localEnd, schedule.timezone)) {
      const dateKey = formatLocalDate(cursor, schedule.timezone);
      const dayOfWeek = localDayOfWeek(cursor, schedule.timezone);
      const override = overrideByDate.get(dateKey);

      let windows: Array<{ startMinute: number; endMinute: number }> = [];
      if (override) {
        if (!override.isUnavailable && override.startMinute != null && override.endMinute != null) {
          windows = [
            {
              startMinute: override.startMinute,
              endMinute: override.endMinute,
            },
          ];
        }
      } else {
        windows = rules
          .filter((rule) => rule.dayOfWeek === dayOfWeek)
          .map((rule) => ({
            startMinute: rule.startMinute,
            endMinute: rule.endMinute,
          }));
      }

      const dayCap = eventType.dailyCap;
      const dayCount = dailyCounts.get(dateKey) ?? 0;
      if (dayCap != null && dayCount >= dayCap) {
        cursor = addDays(cursor, 1);
        continue;
      }

      let bookedThatDay = dayCount;
      for (const window of windows) {
        const windowStart = localWallTimeToUtc(
          dateKey,
          window.startMinute,
          schedule.timezone,
          this.logger,
        );
        const windowEnd = localWallTimeToUtc(
          dateKey,
          window.endMinute,
          schedule.timezone,
          this.logger,
        );
        if (!windowStart || !windowEnd) {
          continue;
        }

        for (
          let t = windowStart;
          t.getTime() + duration * 60_000 <= windowEnd.getTime();
          t = addMinutes(t, stepMinutes)
        ) {
          if (t.getTime() < minStart.getTime()) {
            continue;
          }
          if (t.getTime() < rangeStart.getTime() || t.getTime() >= rangeEnd.getTime()) {
            continue;
          }
          if (dayCap != null && bookedThatDay >= dayCap) {
            break;
          }

          const end = addMinutes(t, duration);
          const occupiedStart = addMinutes(t, -eventType.bufferBeforeMinutes);
          const occupiedEnd = addMinutes(end, eventType.bufferAfterMinutes);
          if (overlapsBusy(occupiedStart, occupiedEnd, busy)) {
            continue;
          }

          slots.push({
            startAt: t.toISOString(),
            endAt: end.toISOString(),
            startLocal: formatInZone(t, input.inviteeTimeZone),
            endLocal: formatInZone(end, input.inviteeTimeZone),
          });
          bookedThatDay += 1;
          if (slots.length >= MAX_SLOTS) {
            truncated = true;
            break;
          }
        }
        if (truncated) {
          break;
        }
      }

      if (truncated) {
        break;
      }
      cursor = addDays(cursor, 1);
    }

    return {
      timezone: input.inviteeTimeZone,
      stale: false,
      truncated,
      slots,
    };
  }

  private async loadBusy(
    hostUserId: string,
    from: Date,
    to: Date,
  ): Promise<BusyInterval[]> {
    const bookings = await this.bookings.listOccupiedForHost(
      hostUserId,
      from,
      to,
      ACTIVE_STATUSES,
    );
    // external_busy_blocks empty until T-016
    return bookings.map((booking) => ({
      start: addMinutes(booking.startAt, -booking.bufferBeforeMinutes),
      end: addMinutes(booking.endAt, booking.bufferAfterMinutes),
    }));
  }
}

function overlapsBusy(
  start: Date,
  end: Date,
  busy: BusyInterval[],
): boolean {
  return busy.some(
    (block) => start.getTime() < block.end.getTime() && end.getTime() > block.start.getTime(),
  );
}

function localDayOfWeek(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
  }).formatToParts(date);
  const weekday = parts.find((part) => part.type === 'weekday')?.value;
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[weekday ?? 'Sun'] ?? 0;
}

function formatLocalDate(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

function sameLocalDate(a: Date, b: Date, timeZone: string): boolean {
  return formatLocalDate(a, timeZone) === formatLocalDate(b, timeZone);
}

function isUsableTimeZone(tz: string): boolean {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function localWallTimeToUtc(
  dateKey: string,
  minuteOfDay: number,
  timeZone: string,
  logger: Logger,
): Date | null {
  let date = dateKey;
  let minute = minuteOfDay;
  if (minute === 1440) {
    const [year, month, day] = dateKey.split('-').map(Number) as [
      number,
      number,
      number,
    ];
    const next = new Date(Date.UTC(year, month - 1, day + 1));
    date = next.toISOString().slice(0, 10);
    minute = 0;
  }
  if (minute < 0 || minute > 1439) {
    return null;
  }

  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  const [year, month, day] = date.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  try {
    // Prefer earlier offset on fall-back ambiguity.
    const local = new TZDate(
      year,
      month - 1,
      day,
      hours,
      minutes,
      0,
      0,
      timeZone,
    );
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(local);
    const hourPart = Number(parts.find((part) => part.type === 'hour')?.value);
    const minutePart = Number(
      parts.find((part) => part.type === 'minute')?.value,
    );
    if (hourPart !== hours || minutePart !== minutes) {
      logger.warn(
        `Skipping invalid local window ${dateKey} ${hours}:${minutes} in ${timeZone}`,
      );
      return null;
    }
    return new Date(local.getTime());
  } catch {
    logger.warn(
      `Skipping invalid local window ${dateKey} ${hours}:${minutes} in ${timeZone}`,
    );
    return null;
  }
}

function formatInZone(date: Date, timeZone: string): string {
  const tzDate = new TZDate(date, timeZone);
  const offset = formatOffset(tzDate, timeZone);
  const y = tzDate.getFullYear();
  const m = String(tzDate.getMonth() + 1).padStart(2, '0');
  const d = String(tzDate.getDate()).padStart(2, '0');
  const hh = String(tzDate.getHours()).padStart(2, '0');
  const mm = String(tzDate.getMinutes()).padStart(2, '0');
  const ss = String(tzDate.getSeconds()).padStart(2, '0');
  const ms = String(tzDate.getMilliseconds()).padStart(3, '0');
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}.${ms}${offset}`;
}

function formatOffset(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
  }).formatToParts(date);
  const raw = parts.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
  if (raw === 'GMT' || raw === 'UTC') {
    return '+00:00';
  }
  const match = /GMT([+-])(\d+)(?::?(\d{2}))?/.exec(raw);
  if (!match) {
    return '+00:00';
  }
  const sign = match[1];
  const hours = match[2]!.padStart(2, '0');
  const minutes = (match[3] ?? '00').padStart(2, '0');
  return `${sign}${hours}:${minutes}`;
}
