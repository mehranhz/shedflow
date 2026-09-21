import { TZDate } from "@date-fns/tz";
import { isValidTimeZone } from "@shedflow/shared";
import { format } from "date-fns";

import { guessTimeZone, listTimeZones } from "@/lib/timezones";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function coerceIanaTimeZone(value?: string | null): string {
  if (value && isIanaTimeZone(value)) {
    return value;
  }
  const guessed = guessTimeZone();
  if (isIanaTimeZone(guessed)) {
    return guessed;
  }
  return "UTC";
}

export function isIanaTimeZone(value: string): boolean {
  return value === "UTC" || isValidTimeZone(value) || listTimeZones().includes(value);
}

export function formatInTimeZone(
  date: Date | string,
  timeZone: string,
  pattern: string,
): string {
  const instant = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(instant.getTime())) {
    return "";
  }
  const zone = coerceIanaTimeZone(timeZone);
  try {
    return format(new TZDate(instant, zone), pattern);
  } catch {
    return format(instant, pattern);
  }
}

/** Locale-aware booking timestamps (Gregorian calendar; Persian labels when `fa`). */
export function formatBookingWhen(
  date: Date | string,
  timeZone: string,
  locale: string,
  style: "full" | "day" | "time" = "full",
): string {
  const instant = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(instant.getTime())) {
    return "";
  }
  const zone = coerceIanaTimeZone(timeZone);
  const intlLocale = locale === "fa" || locale.startsWith("fa-") ? "fa-IR" : "en-US";
  const options: Intl.DateTimeFormatOptions = {
    timeZone: zone,
    calendar: "gregory",
  };
  if (style === "full") {
    Object.assign(options, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } else if (style === "day") {
    Object.assign(options, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  } else {
    Object.assign(options, {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  try {
    return new Intl.DateTimeFormat(intlLocale, options).format(instant);
  } catch {
    return formatInTimeZone(
      instant,
      zone,
      style === "time"
        ? "h:mma"
        : style === "day"
          ? "EEEE, MMMM d"
          : "EEEE, MMMM d, yyyy 'at' h:mma",
    );
  }
}

export function dayKeyInZone(date: Date | string, timeZone: string): string {
  return formatInTimeZone(date, timeZone, "yyyy-MM-dd");
}

/** Civil date the calendar widget displays (browser-local Y-M-D). */
export function calendarDayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** UTC bounds covering the displayed civil month in the invitee IANA zone. */
export function monthRangeInZone(month: Date, timeZone: string): { start: Date; end: Date } {
  const zone = coerceIanaTimeZone(timeZone);
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const startKey = `${year}-${pad(monthIndex + 1)}-01`;
  const nextYear = monthIndex === 11 ? year + 1 : year;
  const nextMonth = monthIndex === 11 ? 1 : monthIndex + 2;
  const endKey = `${nextYear}-${pad(nextMonth)}-01`;
  const start = new TZDate(`${startKey}T00:00:00`, zone);
  const end = new TZDate(`${endKey}T00:00:00`, zone);
  return { start: new Date(start.getTime()), end: new Date(end.getTime()) };
}
