import { TZDate } from "@date-fns/tz";
import { addMinutes, isBefore } from "date-fns";

import type { AvailabilityRule, Schedule, Slot } from "@/lib/types";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function localDateString(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function dayOfWeekInZone(date: Date, timeZone: string): number {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(date);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[weekday] ?? 0;
}

function atLocalMinute(
  dateStr: string,
  minute: number,
  timeZone: string,
): Date {
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  return new TZDate(
    `${dateStr}T${pad(hours)}:${pad(minutes)}:00`,
    timeZone,
  );
}

function toOffsetIso(date: Date, timeZone: string): string {
  const tzDate = new TZDate(date, timeZone);
  return tzDate.toISOString();
}

function windowsForDate(
  dateStr: string,
  schedule: Schedule,
): Array<{ startMinute: number; endMinute: number }> {
  const override = schedule.overrides.find((item) => item.date === dateStr);
  if (override) {
    if (override.isUnavailable || override.startMinute == null || override.endMinute == null) {
      return [];
    }
    return [{ startMinute: override.startMinute, endMinute: override.endMinute }];
  }
  const [year, month, day] = dateStr.split("-").map(Number);
  const noon = new TZDate(
    `${dateStr}T12:00:00`,
    schedule.timezone,
  );
  const dow = dayOfWeekInZone(noon, schedule.timezone);
  return schedule.rules
    .filter((rule) => rule.dayOfWeek === dow)
    .map((rule) => ({ startMinute: rule.startMinute, endMinute: rule.endMinute }));
}

export function generateSlots(input: {
  schedule: Schedule;
  durationMinutes: number;
  slotIntervalMinutes?: number;
  minNoticeMinutes: number;
  maxDaysAhead: number;
  rangeStart: Date;
  rangeEnd: Date;
  inviteeTimeZone: string;
  busy: Array<{ startAt: string; endAt: string }>;
}): { timezone: string; stale: false; truncated: boolean; slots: Slot[] } {
  const step =
    input.slotIntervalMinutes && input.slotIntervalMinutes > 0
      ? input.slotIntervalMinutes
      : input.durationMinutes;
  const now = new Date();
  const minStart = addMinutes(now, input.minNoticeMinutes);
  const maxEnd = addMinutes(startOfLocalDay(now, input.schedule.timezone), input.maxDaysAhead * 24 * 60);

  const cursorStart = isBefore(input.rangeStart, minStart) ? minStart : input.rangeStart;
  const cursorEnd = isBefore(input.rangeEnd, maxEnd) ? input.rangeEnd : maxEnd;

  const slots: Slot[] = [];
  if (!isBefore(cursorStart, cursorEnd)) {
    return {
      timezone: input.inviteeTimeZone,
      stale: false,
      truncated: false,
      slots,
    };
  }

  let day = startOfLocalDay(cursorStart, input.schedule.timezone);
  const last = startOfLocalDay(cursorEnd, input.schedule.timezone);

  while (!isBefore(last, day)) {
    const dateStr = localDateString(day, input.schedule.timezone);
    const windows = windowsForDate(dateStr, input.schedule);
    for (const window of windows) {
      let start = atLocalMinute(dateStr, window.startMinute, input.schedule.timezone);
      const windowEnd = atLocalMinute(dateStr, window.endMinute, input.schedule.timezone);
      while (addMinutes(start, input.durationMinutes) <= windowEnd) {
        const end = addMinutes(start, input.durationMinutes);
        if (
          start >= cursorStart &&
          start < cursorEnd &&
          start >= minStart &&
          !overlapsBusy(start, end, input.busy)
        ) {
          slots.push({
            startAt: start.toISOString(),
            endAt: end.toISOString(),
            startLocal: toOffsetIso(start, input.inviteeTimeZone),
            endLocal: toOffsetIso(end, input.inviteeTimeZone),
          });
          if (slots.length >= 500) {
            return {
              timezone: input.inviteeTimeZone,
              stale: false,
              truncated: true,
              slots,
            };
          }
        }
        start = addMinutes(start, step);
      }
    }
    day = addMinutes(day, 24 * 60);
  }

  return {
    timezone: input.inviteeTimeZone,
    stale: false,
    truncated: false,
    slots,
  };
}

function startOfLocalDay(date: Date, timeZone: string): Date {
  const dateStr = localDateString(date, timeZone);
  return atLocalMinute(dateStr, 0, timeZone);
}

function overlapsBusy(
  start: Date,
  end: Date,
  busy: Array<{ startAt: string; endAt: string }>,
): boolean {
  return busy.some((block) => {
    const blockStart = new Date(block.startAt);
    const blockEnd = new Date(block.endAt);
    return start < blockEnd && end > blockStart;
  });
}

export function defaultWeeklyRules(): AvailabilityRule[] {
  return [1, 2, 3, 4, 5].map((dayOfWeek) => ({
    dayOfWeek,
    startMinute: 9 * 60,
    endMinute: 17 * 60,
  }));
}

export function formatMinute(minute: number): string {
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  const period = hours >= 12 ? "pm" : "am";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${pad(minutes)}${period}`;
}

export function parseTimeToMinute(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 24 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
}

export function minuteToInput(minute: number): string {
  return `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;
}

export { localDateString };
