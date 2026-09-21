import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  CalendarProvider as CalendarProviderEnum,
} from '@shedflow/db';
import { DOMAIN_EVENTS, isOutlookCalendarEnabled } from '@shedflow/shared';
import { randomBytes } from 'node:crypto';
import {
  DEV_ENCRYPTION_KEY_BASE64,
  EnvelopeCrypto,
} from '../common/crypto/envelope';
import { TransactionManager } from '../common/persistence';
import type { RequestContextValue } from '../common/tenancy/request-context';
import { Outbox } from '../domain-events/outbox';
import { PrismaService } from '../prisma/prisma.service';
import {
  CALENDAR_PROVIDER,
  CalendarProvider,
  CalendarTokens,
  MICROSOFT_CALENDAR_PROVIDER,
} from './calendar-provider';

type OAuthState = {
  userId: string;
  organizationId: string;
  provider: 'GOOGLE' | 'MICROSOFT';
  nonce: string;
  codeVerifier?: string;
};

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);
  private readonly crypto: EnvelopeCrypto;
  private readonly appUrl: string;
  private readonly flagsEnv: string | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly outbox: Outbox,
    private readonly transactions: TransactionManager,
    config: ConfigService,
    @Inject(CALENDAR_PROVIDER) private readonly google: CalendarProvider,
    @Inject(MICROSOFT_CALENDAR_PROVIDER)
    private readonly microsoft: CalendarProvider,
  ) {
    const key =
      config.get<string>('ENCRYPTION_KEY')?.trim() || DEV_ENCRYPTION_KEY_BASE64;
    this.crypto = new EnvelopeCrypto(key);
    this.appUrl = (config.get<string>('APP_URL') ?? 'http://localhost:3000').replace(
      /\/$/,
      '',
    );
    this.flagsEnv = config.get<string>('FLAGS');
  }

  startGoogleOAuth(
    organizationId: string,
    ctx: RequestContextValue,
  ): { url: string } {
    const state = this.jwt.sign(
      {
        userId: ctx.userId,
        organizationId,
        provider: 'GOOGLE',
        nonce: Math.random().toString(16).slice(2),
      } satisfies OAuthState,
      { expiresIn: '5m' },
    );
    return { url: this.google.getAuthUrl(state) };
  }

  async startMicrosoftOAuth(
    organizationId: string,
    ctx: RequestContextValue,
  ): Promise<{ url: string }> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { platformPlan: true, settings: true },
    });
    if (
      !isOutlookCalendarEnabled(
        {
          platformPlan: org?.platformPlan,
          settings: org?.settings,
        },
        this.flagsEnv,
      )
    ) {
      throw new ForbiddenException({
        code: 'FEATURE_GATED',
        message:
          'Outlook calendar requires the outlook_calendar flag and a Pro plan',
      });
    }

    const codeVerifier = base64Url(randomBytes(32));
    const state = this.jwt.sign(
      {
        userId: ctx.userId,
        organizationId,
        provider: 'MICROSOFT',
        nonce: Math.random().toString(16).slice(2),
        codeVerifier,
      } satisfies OAuthState,
      { expiresIn: '5m' },
    );
    // Seed PKCE once — getAuthUrl stores verifier by state.
    const url = this.microsoft.getAuthUrl(state);
    return { url };
  }

  async handleGoogleCallback(code: string, state: string): Promise<string> {
    return this.handleOAuthCallback(code, state, 'GOOGLE', this.google);
  }

  async handleMicrosoftCallback(code: string, state: string): Promise<string> {
    return this.handleOAuthCallback(code, state, 'MICROSOFT', this.microsoft);
  }

  private async handleOAuthCallback(
    code: string,
    state: string,
    expected: 'GOOGLE' | 'MICROSOFT',
    provider: CalendarProvider,
  ): Promise<string> {
    let payload: OAuthState;
    try {
      payload = this.jwt.verify<OAuthState>(state);
    } catch {
      throw new BadRequestException('Invalid or expired OAuth state');
    }
    if (payload.provider !== expected) {
      throw new BadRequestException('Invalid OAuth provider');
    }

    const exchanged = await provider.exchangeCode(code, {
      codeVerifier: payload.codeVerifier,
    });
    // Never log tokens — only account email.
    this.logger.log(
      `calendar.oauth.connected provider=${expected} email=${exchanged.accountEmail} org=${payload.organizationId}`,
    );

    const providerEnum =
      expected === 'GOOGLE'
        ? CalendarProviderEnum.GOOGLE
        : CalendarProviderEnum.MICROSOFT;

    const connectionId = await this.transactions.runInTransaction(async () => {
      const connection = await this.prisma.calendarConnection.upsert({
        where: {
          userId_provider_accountEmail: {
            userId: payload.userId,
            provider: providerEnum,
            accountEmail: exchanged.accountEmail,
          },
        },
        create: {
          organizationId: payload.organizationId,
          userId: payload.userId,
          provider: providerEnum,
          accountEmail: exchanged.accountEmail,
          accessTokenEnc: this.enc(exchanged.accessToken),
          refreshTokenEnc: this.enc(exchanged.refreshToken || 'none'),
          tokenExpiresAt: exchanged.expiresAt,
          scopes: exchanged.scopes,
          needsReauth: false,
        },
        update: {
          organizationId: payload.organizationId,
          accessTokenEnc: this.enc(exchanged.accessToken),
          refreshTokenEnc: exchanged.refreshToken
            ? this.enc(exchanged.refreshToken)
            : undefined,
          tokenExpiresAt: exchanged.expiresAt,
          scopes: exchanged.scopes,
          needsReauth: false,
        },
      });

      const calendars = await provider.listCalendars({
        accessToken: exchanged.accessToken,
        refreshToken: exchanged.refreshToken,
        expiresAt: exchanged.expiresAt,
      });

      for (const cal of calendars) {
        await this.prisma.connectedCalendar.upsert({
          where: {
            connectionId_externalId: {
              connectionId: connection.id,
              externalId: cal.externalId,
            },
          },
          create: {
            connectionId: connection.id,
            externalId: cal.externalId,
            name: cal.name,
            isPrimary: cal.primary,
            conflictCheck: cal.primary,
            writeTarget: cal.primary,
          },
          update: {
            name: cal.name,
            isPrimary: cal.primary,
          },
        });
      }

      await this.outbox.emit(
        DOMAIN_EVENTS.CalendarConnectionReady,
        { connectionId: connection.id },
        payload.organizationId,
      );
      return connection.id;
    });

    return `${this.appUrl}/dashboard/settings/calendar?connected=${connectionId}`;
  }

  async listConnections(organizationId: string) {
    const rows = await this.prisma.calendarConnection.findMany({
      where: { organizationId },
      include: { calendars: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      provider: row.provider,
      accountEmail: row.accountEmail,
      lastSyncedAt: row.lastSyncedAt,
      needsReauth: row.needsReauth,
      calendars: row.calendars.map((cal) => ({
        id: cal.id,
        externalId: cal.externalId,
        name: cal.name,
        isPrimary: cal.isPrimary,
        conflictCheck: cal.conflictCheck,
        writeTarget: cal.writeTarget,
      })),
    }));
  }

  async patchCalendar(
    organizationId: string,
    connectionId: string,
    calendarId: string,
    input: { conflictCheck?: boolean; writeTarget?: boolean },
  ) {
    const connection = await this.requireConnection(organizationId, connectionId);
    const calendar = await this.prisma.connectedCalendar.findFirst({
      where: { id: calendarId, connectionId: connection.id },
    });
    if (!calendar) {
      throw new NotFoundException('Calendar not found');
    }

    if (input.writeTarget === true) {
      await this.prisma.connectedCalendar.updateMany({
        where: { connectionId: connection.id },
        data: { writeTarget: false },
      });
    }

    return this.prisma.connectedCalendar.update({
      where: { id: calendar.id },
      data: {
        ...(input.conflictCheck !== undefined
          ? { conflictCheck: input.conflictCheck }
          : {}),
        ...(input.writeTarget !== undefined
          ? { writeTarget: input.writeTarget }
          : {}),
      },
    });
  }

  async disconnect(organizationId: string, connectionId: string): Promise<void> {
    const connection = await this.requireConnection(organizationId, connectionId);
    const provider = this.providerFor(connection.provider);
    const tokens = this.decryptTokens(connection);
    try {
      if (connection.channelId && connection.resourceId) {
        await provider.stopWatch(
          tokens,
          connection.channelId,
          connection.resourceId,
        );
      }
    } catch (error) {
      this.logger.warn(
        `stopWatch failed connection=${connectionId} err=${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const calendarIds = (
      await this.prisma.connectedCalendar.findMany({
        where: { connectionId },
        select: { id: true },
      })
    ).map((c) => c.id);

    await this.prisma.$transaction([
      this.prisma.externalBusyBlock.deleteMany({
        where: { connectedCalendarId: { in: calendarIds } },
      }),
      this.prisma.connectedCalendar.deleteMany({ where: { connectionId } }),
      this.prisma.calendarConnection.delete({ where: { id: connectionId } }),
    ]);
  }

  async listBusyForHost(
    hostUserId: string,
    from: Date,
    to: Date,
  ): Promise<Array<{ start: Date; end: Date }>> {
    const blocks = await this.prisma.externalBusyBlock.findMany({
      where: {
        hostUserId,
        startAt: { lt: to },
        endAt: { gt: from },
        calendar: { conflictCheck: true },
      },
    });
    return blocks.map((b) => ({ start: b.startAt, end: b.endAt }));
  }

  async isConflictSyncStale(hostUserId: string, maxAgeMs = 60_000): Promise<boolean> {
    const connections = await this.prisma.calendarConnection.findMany({
      where: {
        userId: hostUserId,
        calendars: { some: { conflictCheck: true } },
      },
    });
    if (connections.length === 0) {
      return false;
    }
    const now = Date.now();
    return connections.some(
      (c) => !c.lastSyncedAt || now - c.lastSyncedAt.getTime() > maxAgeMs,
    );
  }

  async liveFreeBusyMerge(
    hostUserId: string,
    from: Date,
    to: Date,
  ): Promise<Array<{ start: Date; end: Date }>> {
    const connections = await this.prisma.calendarConnection.findMany({
      where: {
        userId: hostUserId,
        needsReauth: false,
        calendars: { some: { conflictCheck: true } },
      },
      include: {
        calendars: { where: { conflictCheck: true } },
      },
    });
    const merged: Array<{ start: Date; end: Date }> = [];
    let ok = 0;
    for (const connection of connections) {
      try {
        const tokens = await this.ensureFreshTokens(connection);
        const ids = connection.calendars.map((c) => c.externalId);
        if (ids.length === 0) continue;
        const provider = this.providerFor(connection.provider);
        const blocks = await withTimeout(
          provider.freeBusy(tokens, ids, from, to),
          2000,
        );
        for (const block of blocks) {
          merged.push({ start: block.start, end: block.end });
        }
        ok += 1;
      } catch {
        // per-connection timeout/error
      }
    }
    if (ok === 0 && connections.length > 0) {
      throw new Error('live freebusy failed');
    }
    return merged;
  }

  decryptTokens(connection: {
    accessTokenEnc: Buffer | Uint8Array;
    refreshTokenEnc: Buffer | Uint8Array;
    tokenExpiresAt: Date;
  }): CalendarTokens {
    return {
      accessToken: this.crypto.decrypt(connection.accessTokenEnc),
      refreshToken: this.crypto.decrypt(connection.refreshTokenEnc),
      expiresAt: connection.tokenExpiresAt,
    };
  }

  async ensureFreshTokens(connection: {
    id: string;
    provider: CalendarProviderEnum;
    accessTokenEnc: Buffer | Uint8Array;
    refreshTokenEnc: Buffer | Uint8Array;
    tokenExpiresAt: Date;
  }): Promise<CalendarTokens> {
    const tokens = this.decryptTokens(connection);
    if (tokens.expiresAt.getTime() > Date.now() + 60_000) {
      return tokens;
    }
    const provider = this.providerFor(connection.provider);
    try {
      const refreshed = await provider.refresh(tokens);
      await this.prisma.calendarConnection.update({
        where: { id: connection.id },
        data: {
          accessTokenEnc: this.enc(refreshed.accessToken),
          refreshTokenEnc: this.enc(refreshed.refreshToken),
          tokenExpiresAt: refreshed.expiresAt,
          needsReauth: false,
        },
      });
      return refreshed;
    } catch {
      await this.prisma.calendarConnection.update({
        where: { id: connection.id },
        data: { needsReauth: true },
      });
      throw new Error('calendar refresh failed');
    }
  }

  /** Whether Outlook connect is available for this org (flag + PRO). */
  async outlookAvailable(organizationId: string): Promise<boolean> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { platformPlan: true, settings: true },
    });
    return isOutlookCalendarEnabled(
      { platformPlan: org?.platformPlan, settings: org?.settings },
      this.flagsEnv,
    );
  }

  private providerFor(
    provider: CalendarProviderEnum | 'GOOGLE' | 'MICROSOFT',
  ): CalendarProvider {
    if (provider === CalendarProviderEnum.MICROSOFT) {
      return this.microsoft;
    }
    return this.google;
  }

  /** Copy into ArrayBuffer-backed bytes for Prisma `Bytes` (TS DOM lib). */
  private enc(plaintext: string): Uint8Array<ArrayBuffer> {
    const encrypted = this.crypto.encrypt(plaintext);
    const bytes = new Uint8Array(encrypted.byteLength);
    bytes.set(encrypted);
    return bytes;
  }

  private async requireConnection(organizationId: string, connectionId: string) {
    const connection = await this.prisma.calendarConnection.findFirst({
      where: { id: connectionId, organizationId },
    });
    if (!connection) {
      throw new NotFoundException('Connection not found');
    }
    return connection;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function base64Url(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
