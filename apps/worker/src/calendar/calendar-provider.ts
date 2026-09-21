export type CalendarTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
};

export type BusyBlock = {
  start: Date;
  end: Date;
  externalEventId: string;
  etag?: string;
};

export type CalendarListItem = {
  externalId: string;
  name: string;
  primary: boolean;
};

export type CalendarEventInput = {
  summary: string;
  description?: string;
  location?: string;
  startAt: Date;
  endAt: Date;
  timezone: string;
  attendeeEmails: string[];
  createMeet?: boolean;
  bookingId: string;
};

export abstract class CalendarProvider {
  abstract readonly name: 'GOOGLE' | 'MICROSOFT';

  abstract getAuthUrl(state: string): string;

  abstract exchangeCode(
    code: string,
    opts?: { codeVerifier?: string },
  ): Promise<CalendarTokens & { accountEmail: string; scopes: string[] }>;

  abstract refresh(tokens: CalendarTokens): Promise<CalendarTokens>;

  abstract listCalendars(tokens: CalendarTokens): Promise<CalendarListItem[]>;

  abstract freeBusy(
    tokens: CalendarTokens,
    calendarIds: string[],
    from: Date,
    to: Date,
  ): Promise<BusyBlock[]>;

  abstract incrementalSync(
    tokens: CalendarTokens,
    calendarId: string,
    syncToken?: string,
  ): Promise<{
    upserts: BusyBlock[];
    deletes: string[];
    nextSyncToken: string;
  }>;

  abstract fullSync(
    tokens: CalendarTokens,
    calendarId: string,
    from: Date,
    to: Date,
  ): Promise<{ upserts: BusyBlock[]; nextSyncToken: string }>;

  abstract createEvent(
    tokens: CalendarTokens,
    calendarId: string,
    input: CalendarEventInput,
  ): Promise<{ externalEventId: string; meetUrl?: string }>;

  abstract updateEvent(
    tokens: CalendarTokens,
    calendarId: string,
    externalEventId: string,
    input: Partial<CalendarEventInput>,
  ): Promise<void>;

  abstract deleteEvent(
    tokens: CalendarTokens,
    calendarId: string,
    externalEventId: string,
  ): Promise<void>;

  abstract watch(
    tokens: CalendarTokens,
    calendarId: string,
    webhookUrl: string,
  ): Promise<{ channelId: string; resourceId: string; expiresAt: Date }>;

  abstract stopWatch(
    tokens: CalendarTokens,
    channelId: string,
    resourceId: string,
  ): Promise<void>;
}

export const CALENDAR_PROVIDER = Symbol('CALENDAR_PROVIDER');
export const MICROSOFT_CALENDAR_PROVIDER = Symbol('MICROSOFT_CALENDAR_PROVIDER');
