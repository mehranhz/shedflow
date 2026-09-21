import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BusyBlock,
  CalendarEventInput,
  CalendarListItem,
  CalendarProvider,
  CalendarTokens,
} from './calendar-provider';
import {
  mapGoogleEventsToBusy,
  type GoogleCalendarEvent,
} from './google-event-mapper';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];

@Injectable()
export class GoogleCalendarProvider extends CalendarProvider {
  readonly name = 'GOOGLE' as const;
  private readonly logger = new Logger(GoogleCalendarProvider.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;

  constructor(config: ConfigService) {
    super();
    this.clientId = config.get<string>('GOOGLE_CLIENT_ID') ?? '';
    this.clientSecret = config.get<string>('GOOGLE_CLIENT_SECRET') ?? '';
    const apiUrl = (config.get<string>('API_URL') ?? 'http://localhost:3001').replace(
      /\/$/,
      '',
    );
    this.redirectUri = `${apiUrl}/v1/calendar/google/callback`;
  }

  getAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeCode(
    code: string,
    _opts?: { codeVerifier?: string },
  ): Promise<CalendarTokens & { accountEmail: string; scopes: string[] }> {
    const token = await this.tokenRequest({
      code,
      grant_type: 'authorization_code',
      redirect_uri: this.redirectUri,
    });
    const email = await this.fetchEmail(token.access_token);
    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? '',
      expiresAt: new Date(Date.now() + (token.expires_in ?? 3600) * 1000),
      accountEmail: email,
      scopes: SCOPES,
    };
  }

  async refresh(tokens: CalendarTokens): Promise<CalendarTokens> {
    const token = await this.tokenRequest({
      refresh_token: tokens.refreshToken,
      grant_type: 'refresh_token',
    });
    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? tokens.refreshToken,
      expiresAt: new Date(Date.now() + (token.expires_in ?? 3600) * 1000),
    };
  }

  async listCalendars(tokens: CalendarTokens): Promise<CalendarListItem[]> {
    const data = await this.apiGet<{
      items?: Array<{ id: string; summary?: string; primary?: boolean }>;
    }>(tokens, 'https://www.googleapis.com/calendar/v3/users/me/calendarList');
    return (data.items ?? []).map((item) => ({
      externalId: item.id,
      name: item.summary ?? item.id,
      primary: Boolean(item.primary),
    }));
  }

  async freeBusy(
    tokens: CalendarTokens,
    calendarIds: string[],
    from: Date,
    to: Date,
  ): Promise<BusyBlock[]> {
    const body = {
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      items: calendarIds.map((id) => ({ id })),
    };
    const data = await this.apiPost<{
      calendars?: Record<string, { busy?: Array<{ start: string; end: string }> }>;
    }>(tokens, 'https://www.googleapis.com/calendar/v3/freeBusy', body);
    const blocks: BusyBlock[] = [];
    for (const [calId, cal] of Object.entries(data.calendars ?? {})) {
      for (const slot of cal.busy ?? []) {
        blocks.push({
          start: new Date(slot.start),
          end: new Date(slot.end),
          externalEventId: `fb:${calId}:${slot.start}`,
        });
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
    const params = new URLSearchParams({
      singleEvents: 'true',
      showDeleted: 'true',
    });
    if (syncToken) {
      params.set('syncToken', syncToken);
    } else {
      params.set('timeMin', new Date().toISOString());
    }
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
    try {
      const data = await this.apiGet<{
        items?: GoogleCalendarEvent[];
        nextSyncToken?: string;
      }>(tokens, url);
      const deletes = (data.items ?? [])
        .filter((e) => e.status === 'cancelled' && e.id)
        .map((e) => e.id!);
      const upserts = mapGoogleEventsToBusy(data.items ?? []);
      return {
        upserts,
        deletes,
        nextSyncToken: data.nextSyncToken ?? syncToken ?? '',
      };
    } catch (error) {
      if (isHttpStatus(error, 410)) {
        throw error;
      }
      throw error;
    }
  }

  async fullSync(
    tokens: CalendarTokens,
    calendarId: string,
    from: Date,
    to: Date,
  ): Promise<{ upserts: BusyBlock[]; nextSyncToken: string }> {
    const params = new URLSearchParams({
      singleEvents: 'true',
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
    });
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
    const data = await this.apiGet<{
      items?: GoogleCalendarEvent[];
      nextSyncToken?: string;
    }>(tokens, url);
    return {
      upserts: mapGoogleEventsToBusy(data.items ?? []),
      nextSyncToken: data.nextSyncToken ?? `full-${Date.now()}`,
    };
  }

  async createEvent(
    tokens: CalendarTokens,
    calendarId: string,
    input: CalendarEventInput,
  ): Promise<{ externalEventId: string; meetUrl?: string }> {
    const body: Record<string, unknown> = {
      summary: input.summary,
      description: input.description,
      location: input.location,
      start: { dateTime: input.startAt.toISOString(), timeZone: 'UTC' },
      end: { dateTime: input.endAt.toISOString(), timeZone: 'UTC' },
      attendees: input.attendeeEmails.map((email) => ({ email })),
      extendedProperties: {
        private: { schedflowBookingId: input.bookingId },
      },
    };
    if (input.createMeet) {
      body.conferenceData = {
        createRequest: {
          requestId: input.bookingId,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      };
    }
    const qs = input.createMeet ? '?conferenceDataVersion=1&sendUpdates=all' : '?sendUpdates=all';
    const data = await this.apiPost<{
      id: string;
      hangoutLink?: string;
    }>(
      tokens,
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events${qs}`,
      body,
    );
    return { externalEventId: data.id, meetUrl: data.hangoutLink };
  }

  async updateEvent(
    tokens: CalendarTokens,
    calendarId: string,
    externalEventId: string,
    input: Partial<CalendarEventInput>,
  ): Promise<void> {
    const body: Record<string, unknown> = {};
    if (input.startAt) {
      body.start = { dateTime: input.startAt.toISOString(), timeZone: 'UTC' };
    }
    if (input.endAt) {
      body.end = { dateTime: input.endAt.toISOString(), timeZone: 'UTC' };
    }
    if (input.summary) body.summary = input.summary;
    if (input.description) body.description = input.description;
    if (input.location) body.location = input.location;
    await this.apiPatch(
      tokens,
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(externalEventId)}?sendUpdates=all`,
      body,
    );
  }

  async deleteEvent(
    tokens: CalendarTokens,
    calendarId: string,
    externalEventId: string,
  ): Promise<void> {
    await this.apiDelete(
      tokens,
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(externalEventId)}?sendUpdates=all`,
    );
  }

  async watch(
    tokens: CalendarTokens,
    calendarId: string,
    webhookUrl: string,
  ): Promise<{ channelId: string; resourceId: string; expiresAt: Date }> {
    const channelId = cryptoRandomId();
    const data = await this.apiPost<{
      resourceId: string;
      expiration?: string;
    }>(
      tokens,
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/watch`,
      {
        id: channelId,
        type: 'web_hook',
        address: webhookUrl,
      },
    );
    return {
      channelId,
      resourceId: data.resourceId,
      expiresAt: data.expiration
        ? new Date(Number(data.expiration))
        : new Date(Date.now() + 7 * 24 * 3600_000),
    };
  }

  async stopWatch(
    tokens: CalendarTokens,
    channelId: string,
    resourceId: string,
  ): Promise<void> {
    await this.apiPost(tokens, 'https://www.googleapis.com/calendar/v3/channels/stop', {
      id: channelId,
      resourceId,
    });
  }

  private async tokenRequest(
    params: Record<string, string>,
  ): Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  }> {
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      ...params,
    });
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!response.ok) {
      this.logger.warn(`google token exchange failed status=${response.status}`);
      throw Object.assign(new Error('google token exchange failed'), {
        status: response.status,
      });
    }
    return (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };
  }

  private async fetchEmail(accessToken: string): Promise<string> {
    const response = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!response.ok) {
      throw new Error('failed to load google userinfo');
    }
    const data = (await response.json()) as { email?: string };
    return data.email ?? 'unknown@google';
  }

  private async apiGet<T>(tokens: CalendarTokens, url: string): Promise<T> {
    return this.apiJson<T>(tokens, url, 'GET');
  }

  private async apiPost<T>(
    tokens: CalendarTokens,
    url: string,
    body: unknown,
  ): Promise<T> {
    return this.apiJson<T>(tokens, url, 'POST', body);
  }

  private async apiPatch<T>(
    tokens: CalendarTokens,
    url: string,
    body: unknown,
  ): Promise<T> {
    return this.apiJson<T>(tokens, url, 'PATCH', body);
  }

  private async apiDelete(tokens: CalendarTokens, url: string): Promise<void> {
    await this.apiJson(tokens, url, 'DELETE');
  }

  private async apiJson<T>(
    tokens: CalendarTokens,
    url: string,
    method: string,
    body?: unknown,
  ): Promise<T> {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      this.logger.warn(`google api ${method} failed status=${response.status}`);
      throw Object.assign(new Error(`google api ${response.status}`), {
        status: response.status,
      });
    }
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }
}

function isHttpStatus(error: unknown, status: number): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error as { status: number }).status === status
  );
}

function cryptoRandomId(): string {
  return `ch_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
