import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import {
  BusyBlock,
  CalendarEventInput,
  CalendarListItem,
  CalendarProvider,
  CalendarTokens,
} from './calendar-provider';
import {
  mapMicrosoftEventsToBusy,
  microsoftDeletedEventIds,
  type MicrosoftGraphEvent,
} from './microsoft-event-mapper';

const SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'User.Read',
  'Calendars.ReadWrite',
];

/**
 * Microsoft 365 / Outlook calendar via Graph (T-017).
 * Auth code + PKCE. No Teams online meeting in MVP.
 */
@Injectable()
export class MicrosoftCalendarProvider extends CalendarProvider {
  readonly name = 'MICROSOFT' as const;
  private readonly logger = new Logger(MicrosoftCalendarProvider.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly tenant: string;
  private readonly redirectUri: string;
  /** PKCE verifiers keyed by OAuth state (short-lived). */
  private readonly pkceByState = new Map<string, string>();

  constructor(config: ConfigService) {
    super();
    this.clientId =
      config.get<string>('MICROSOFT_CLIENT_ID')?.trim() ||
      config.get<string>('MS_CLIENT_ID')?.trim() ||
      '';
    this.clientSecret =
      config.get<string>('MICROSOFT_CLIENT_SECRET')?.trim() ||
      config.get<string>('MS_CLIENT_SECRET')?.trim() ||
      '';
    this.tenant =
      config.get<string>('MICROSOFT_TENANT')?.trim() ||
      config.get<string>('MS_TENANT')?.trim() ||
      'common';
    const apiUrl = (
      config.get<string>('API_URL') ?? 'http://localhost:3001'
    ).replace(/\/$/, '');
    this.redirectUri = `${apiUrl}/v1/calendar/microsoft/callback`;
  }

  /** Build authorize URL; stores PKCE verifier for this state. */
  getAuthUrl(state: string): string {
    const verifier = base64Url(randomBytes(32));
    this.pkceByState.set(state, verifier);
    // Drop stale entries opportunistically
    if (this.pkceByState.size > 500) {
      const first = this.pkceByState.keys().next().value;
      if (first) this.pkceByState.delete(first);
    }
    const challenge = base64Url(createHash('sha256').update(verifier).digest());
    const params = new URLSearchParams({
      client_id: this.clientId || 'missing-microsoft-client-id',
      response_type: 'code',
      redirect_uri: this.redirectUri,
      response_mode: 'query',
      scope: SCOPES.join(' '),
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    return `https://login.microsoftonline.com/${this.tenant}/oauth2/v2.0/authorize?${params.toString()}`;
  }

  /** Test helper / callback: consume PKCE verifier for state. */
  takePkceVerifier(state: string): string | undefined {
    const value = this.pkceByState.get(state);
    this.pkceByState.delete(state);
    return value;
  }

  async exchangeCode(
    code: string,
    opts?: { codeVerifier?: string },
  ): Promise<CalendarTokens & { accountEmail: string; scopes: string[] }> {
    const verifier = opts?.codeVerifier ?? this.takePkceVerifier('') ?? '';
    const token = await this.tokenRequest({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
      code_verifier: verifier,
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
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
    });
    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? tokens.refreshToken,
      expiresAt: new Date(Date.now() + (token.expires_in ?? 3600) * 1000),
    };
  }

  async listCalendars(tokens: CalendarTokens): Promise<CalendarListItem[]> {
    const data = await this.apiGet<{
      value?: Array<{ id: string; name?: string; isDefaultCalendar?: boolean }>;
    }>(tokens, 'https://graph.microsoft.com/v1.0/me/calendars');
    return (data.value ?? []).map((item) => ({
      externalId: item.id,
      name: item.name ?? item.id,
      primary: Boolean(item.isDefaultCalendar),
    }));
  }

  async freeBusy(
    tokens: CalendarTokens,
    calendarIds: string[],
    from: Date,
    to: Date,
  ): Promise<BusyBlock[]> {
    const data = await this.apiPost<{
      value?: Array<{
        scheduleId?: string;
        scheduleItems?: Array<{
          start?: { dateTime?: string };
          end?: { dateTime?: string };
          status?: string;
        }>;
      }>;
    }>(tokens, 'https://graph.microsoft.com/v1.0/me/calendar/getSchedule', {
      schedules: calendarIds,
      startTime: { dateTime: from.toISOString(), timeZone: 'UTC' },
      endTime: { dateTime: to.toISOString(), timeZone: 'UTC' },
      availabilityViewInterval: 30,
    });
    const blocks: BusyBlock[] = [];
    for (const schedule of data.value ?? []) {
      for (const item of schedule.scheduleItems ?? []) {
        if ((item.status ?? '').toLowerCase() === 'free') continue;
        const start = item.start?.dateTime
          ? new Date(
              /Z$|[+-]\d{2}:\d{2}$/.test(item.start.dateTime)
                ? item.start.dateTime
                : `${item.start.dateTime}Z`,
            )
          : null;
        const end = item.end?.dateTime
          ? new Date(
              /Z$|[+-]\d{2}:\d{2}$/.test(item.end.dateTime)
                ? item.end.dateTime
                : `${item.end.dateTime}Z`,
            )
          : null;
        if (!start || !end || Number.isNaN(start.getTime())) continue;
        blocks.push({
          start,
          end,
          externalEventId: `fb:${schedule.scheduleId ?? 'cal'}:${start.toISOString()}`,
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
    const url =
      syncToken ||
      `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(calendarId)}/events/delta?$select=id,isCancelled,showAs,isAllDay,start,end`;
    try {
      const data = await this.apiGet<{
        value?: MicrosoftGraphEvent[];
        '@odata.deltaLink'?: string;
        '@odata.nextLink'?: string;
      }>(tokens, url);
      // Follow a single page for MVP; nextLink without deltaLink means more pages — store nextLink as token
      const next =
        data['@odata.deltaLink'] ??
        data['@odata.nextLink'] ??
        syncToken ??
        '';
      return {
        upserts: mapMicrosoftEventsToBusy(data.value ?? []),
        deletes: microsoftDeletedEventIds(data.value ?? []),
        nextSyncToken: next,
      };
    } catch (error) {
      if (isHttpStatus(error, 410) || isHttpStatus(error, 404)) {
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
      startDateTime: from.toISOString(),
      endDateTime: to.toISOString(),
      $select: 'id,isCancelled,showAs,isAllDay,start,end',
    });
    const url = `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(calendarId)}/calendarView?${params}`;
    const data = await this.apiGet<{
      value?: MicrosoftGraphEvent[];
    }>(tokens, url);
    // Seed delta token
    let nextSyncToken = `full-${Date.now()}`;
    try {
      const delta = await this.incrementalSync(tokens, calendarId);
      if (delta.nextSyncToken) {
        nextSyncToken = delta.nextSyncToken;
      }
    } catch {
      // keep synthetic token; next incremental will full-sync again
    }
    return {
      upserts: mapMicrosoftEventsToBusy(data.value ?? []),
      nextSyncToken,
    };
  }

  async createEvent(
    tokens: CalendarTokens,
    calendarId: string,
    input: CalendarEventInput,
  ): Promise<{ externalEventId: string; meetUrl?: string }> {
    const body = {
      subject: input.summary,
      body: input.description
        ? { contentType: 'text', content: input.description }
        : undefined,
      location: input.location ? { displayName: input.location } : undefined,
      start: {
        dateTime: input.startAt.toISOString().replace(/\.\d{3}Z$/, ''),
        timeZone: 'UTC',
      },
      end: {
        dateTime: input.endAt.toISOString().replace(/\.\d{3}Z$/, ''),
        timeZone: 'UTC',
      },
      attendees: input.attendeeEmails.map((email) => ({
        emailAddress: { address: email },
        type: 'required',
      })),
      singleValueExtendedProperties: [
        {
          id: 'String {66f5a359-4659-4830-9070-00047ec6ac6e} Name schedflowBookingId',
          value: input.bookingId,
        },
      ],
    };
    const data = await this.apiPost<{ id: string }>(
      tokens,
      `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(calendarId)}/events`,
      body,
    );
    return { externalEventId: data.id };
  }

  async updateEvent(
    tokens: CalendarTokens,
    calendarId: string,
    externalEventId: string,
    input: Partial<CalendarEventInput>,
  ): Promise<void> {
    const body: Record<string, unknown> = {};
    if (input.summary) body.subject = input.summary;
    if (input.description) {
      body.body = { contentType: 'text', content: input.description };
    }
    if (input.location) body.location = { displayName: input.location };
    if (input.startAt) {
      body.start = {
        dateTime: input.startAt.toISOString().replace(/\.\d{3}Z$/, ''),
        timeZone: 'UTC',
      };
    }
    if (input.endAt) {
      body.end = {
        dateTime: input.endAt.toISOString().replace(/\.\d{3}Z$/, ''),
        timeZone: 'UTC',
      };
    }
    await this.apiPatch(
      tokens,
      `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(externalEventId)}`,
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
      `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(externalEventId)}`,
    );
  }

  async watch(
    tokens: CalendarTokens,
    calendarId: string,
    webhookUrl: string,
  ): Promise<{ channelId: string; resourceId: string; expiresAt: Date }> {
    const expiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const data = await this.apiPost<{
      id: string;
      resource?: string;
      expirationDateTime?: string;
    }>(tokens, 'https://graph.microsoft.com/v1.0/subscriptions', {
      changeType: 'created,updated,deleted',
      notificationUrl: webhookUrl,
      resource: `/me/calendars/${calendarId}/events`,
      expirationDateTime: expiresAt.toISOString(),
      clientState: `schedflow-${calendarId}`,
    });
    return {
      channelId: data.id,
      resourceId: data.resource ?? calendarId,
      expiresAt: data.expirationDateTime
        ? new Date(data.expirationDateTime)
        : expiresAt,
    };
  }

  async stopWatch(
    tokens: CalendarTokens,
    channelId: string,
    _resourceId: string,
  ): Promise<void> {
    await this.apiDelete(
      tokens,
      `https://graph.microsoft.com/v1.0/subscriptions/${encodeURIComponent(channelId)}`,
    );
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
      scope: SCOPES.join(' '),
      ...params,
    });
    const response = await fetch(
      `https://login.microsoftonline.com/${this.tenant}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      },
    );
    if (!response.ok) {
      this.logger.warn(`microsoft token exchange failed status=${response.status}`);
      throw Object.assign(new Error('microsoft token exchange failed'), {
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
    const response = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      throw new Error('failed to load microsoft profile');
    }
    const data = (await response.json()) as {
      mail?: string;
      userPrincipalName?: string;
    };
    return data.mail ?? data.userPrincipalName ?? 'unknown@microsoft';
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
      this.logger.warn(`microsoft api ${method} failed status=${response.status}`);
      throw Object.assign(new Error(`microsoft api ${response.status}`), {
        status: response.status,
      });
    }
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }
}

function base64Url(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function isHttpStatus(error: unknown, status: number): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error as { status: number }).status === status
  );
}
