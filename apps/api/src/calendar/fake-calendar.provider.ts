import { Injectable } from '@nestjs/common';
import {
  BusyBlock,
  CalendarEventInput,
  CalendarListItem,
  CalendarProvider,
  CalendarTokens,
} from './calendar-provider';
import { mapGoogleEventsToBusy, type GoogleCalendarEvent } from './google-event-mapper';

/**
 * In-memory calendar for CI / local without Google credentials.
 * Seed via `seedEvents` — never logs tokens.
 */
@Injectable()
export class FakeCalendarProvider extends CalendarProvider {
  readonly name = 'GOOGLE' as const;
  private events = new Map<string, GoogleCalendarEvent[]>();
  private syncTokens = new Map<string, string>();
  readonly createdEvents: Array<{
    calendarId: string;
    input: CalendarEventInput;
  }> = [];
  readonly deletedEvents: string[] = [];

  seedEvents(calendarId: string, events: GoogleCalendarEvent[]): void {
    this.events.set(calendarId, events);
  }

  getAuthUrl(state: string): string {
    return `https://accounts.google.com/o/oauth2/v2/auth?state=${encodeURIComponent(state)}&fake=1`;
  }

  async exchangeCode(
    code: string,
    _opts?: { codeVerifier?: string },
  ): Promise<CalendarTokens & { accountEmail: string; scopes: string[] }> {
    return {
      accessToken: `access-${code}`,
      refreshToken: `refresh-${code}`,
      expiresAt: new Date(Date.now() + 3600_000),
      accountEmail: 'host@example.com',
      scopes: [
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/calendar.readonly',
      ],
    };
  }

  async refresh(tokens: CalendarTokens): Promise<CalendarTokens> {
    return {
      ...tokens,
      accessToken: `refreshed-${tokens.accessToken.slice(0, 8)}`,
      expiresAt: new Date(Date.now() + 3600_000),
    };
  }

  async listCalendars(_tokens: CalendarTokens): Promise<CalendarListItem[]> {
    return [{ externalId: 'primary', name: 'Primary', primary: true }];
  }

  async freeBusy(
    _tokens: CalendarTokens,
    calendarIds: string[],
    from: Date,
    to: Date,
  ): Promise<BusyBlock[]> {
    const blocks: BusyBlock[] = [];
    for (const id of calendarIds) {
      for (const block of mapGoogleEventsToBusy(this.events.get(id) ?? [])) {
        if (block.start < to && block.end > from) {
          blocks.push(block);
        }
      }
    }
    return blocks;
  }

  async incrementalSync(
    tokens: CalendarTokens,
    calendarId: string,
    syncToken?: string,
  ): Promise<{
    upserts: BusyBlock[];
    deletes: string[];
    nextSyncToken: string;
  }> {
    if (syncToken === 'gone') {
      throw Object.assign(new Error('410 sync token invalid'), { status: 410 });
    }
    const upserts = await this.freeBusy(
      tokens,
      [calendarId],
      new Date(0),
      new Date('2100-01-01T00:00:00.000Z'),
    );
    const next = `sync-${calendarId}-${Date.now()}`;
    this.syncTokens.set(calendarId, next);
    return { upserts, deletes: [], nextSyncToken: next };
  }

  async fullSync(
    tokens: CalendarTokens,
    calendarId: string,
    from: Date,
    to: Date,
  ): Promise<{ upserts: BusyBlock[]; nextSyncToken: string }> {
    const upserts = await this.freeBusy(tokens, [calendarId], from, to);
    const next = `full-${calendarId}-${Date.now()}`;
    this.syncTokens.set(calendarId, next);
    return { upserts, nextSyncToken: next };
  }

  async createEvent(
    _tokens: CalendarTokens,
    calendarId: string,
    input: CalendarEventInput,
  ): Promise<{ externalEventId: string; meetUrl?: string }> {
    this.createdEvents.push({ calendarId, input });
    const id = `evt-${this.createdEvents.length}`;
    const events = this.events.get(calendarId) ?? [];
    events.push({
      id,
      status: 'confirmed',
      start: { dateTime: input.startAt.toISOString() },
      end: { dateTime: input.endAt.toISOString() },
    });
    this.events.set(calendarId, events);
    return {
      externalEventId: id,
      meetUrl: input.createMeet
        ? `https://meet.google.com/fake-${id}`
        : undefined,
    };
  }

  async updateEvent(
    _tokens: CalendarTokens,
    calendarId: string,
    externalEventId: string,
    input: Partial<CalendarEventInput>,
  ): Promise<void> {
    const events = this.events.get(calendarId) ?? [];
    const idx = events.findIndex((e) => e.id === externalEventId);
    if (idx >= 0 && input.startAt && input.endAt) {
      events[idx] = {
        ...events[idx],
        start: { dateTime: input.startAt.toISOString() },
        end: { dateTime: input.endAt.toISOString() },
      };
    }
  }

  async deleteEvent(
    _tokens: CalendarTokens,
    calendarId: string,
    externalEventId: string,
  ): Promise<void> {
    this.deletedEvents.push(externalEventId);
    const events = this.events.get(calendarId) ?? [];
    this.events.set(
      calendarId,
      events.filter((e) => e.id !== externalEventId),
    );
  }

  async watch(
    _tokens: CalendarTokens,
    _calendarId: string,
    _webhookUrl: string,
  ): Promise<{ channelId: string; resourceId: string; expiresAt: Date }> {
    return {
      channelId: `ch-${Date.now()}`,
      resourceId: `res-${Date.now()}`,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600_000),
    };
  }

  async stopWatch(): Promise<void> {
    return;
  }
}
