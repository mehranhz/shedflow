import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { CalendarProvider as CalendarProviderEnum } from '@shedflow/db';
import { DOMAIN_EVENTS } from '@shedflow/shared';
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
} from './calendar-provider';

type OAuthState = {
  userId: string;
  organizationId: string;
  provider: 'GOOGLE';
  nonce: string;
};

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);
  private readonly crypto: EnvelopeCrypto;
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly outbox: Outbox,
    private readonly transactions: TransactionManager,
    config: ConfigService,
    @Inject(CALENDAR_PROVIDER) private readonly provider: CalendarProvider,
  ) {
    const key =
      config.get<string>('ENCRYPTION_KEY')?.trim() || DEV_ENCRYPTION_KEY_BASE64;
    this.crypto = new EnvelopeCrypto(key);
    this.appUrl = (config.get<string>('APP_URL') ?? 'http://localhost:3000').replace(
      /\/$/,
      '',
    );
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
    return { url: this.provider.getAuthUrl(state) };
  }

  async handleGoogleCallback(code: string, state: string): Promise<string> {
    let payload: OAuthState;
    try {
      payload = this.jwt.verify<OAuthState>(state);
    } catch {
      throw new BadRequestException('Invalid or expired OAuth state');
    }
    if (payload.provider !== 'GOOGLE') {
      throw new BadRequestException('Invalid OAuth provider');
    }

    const exchanged = await this.provider.exchangeCode(code);
    // Never log tokens — only account email.
    this.logger.log(
      `calendar.oauth.connected email=${exchanged.accountEmail} org=${payload.organizationId}`,
    );

    const connectionId = await this.transactions.runInTransaction(async () => {
      const connection = await this.prisma.calendarConnection.upsert({
        where: {
          userId_provider_accountEmail: {
            userId: payload.userId,
            provider: CalendarProviderEnum.GOOGLE,
            accountEmail: exchanged.accountEmail,
          },
        },
        create: {
          organizationId: payload.organizationId,
          userId: payload.userId,
          provider: CalendarProviderEnum.GOOGLE,
          accountEmail: exchanged.accountEmail,
          accessTokenEnc: this.crypto.encrypt(exchanged.accessToken),
          refreshTokenEnc: this.crypto.encrypt(
            exchanged.refreshToken || 'none',
          ),
          tokenExpiresAt: exchanged.expiresAt,
          scopes: exchanged.scopes,
          needsReauth: false,
        },
        update: {
          organizationId: payload.organizationId,
          accessTokenEnc: this.crypto.encrypt(exchanged.accessToken),
          refreshTokenEnc: exchanged.refreshToken
            ? this.crypto.encrypt(exchanged.refreshToken)
            : undefined,
          tokenExpiresAt: exchanged.expiresAt,
          scopes: exchanged.scopes,
          needsReauth: false,
        },
      });

      const calendars = await this.provider.listCalendars({
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
    const tokens = this.decryptTokens(connection);
    try {
      if (connection.channelId && connection.resourceId) {
        await this.provider.stopWatch(
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
        const blocks = await withTimeout(
          this.provider.freeBusy(tokens, ids, from, to),
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
      accessToken: this.crypto.decrypt(Buffer.from(connection.accessTokenEnc)),
      refreshToken: this.crypto.decrypt(Buffer.from(connection.refreshTokenEnc)),
      expiresAt: connection.tokenExpiresAt,
    };
  }

  async ensureFreshTokens(connection: {
    id: string;
    accessTokenEnc: Buffer | Uint8Array;
    refreshTokenEnc: Buffer | Uint8Array;
    tokenExpiresAt: Date;
  }): Promise<CalendarTokens> {
    const tokens = this.decryptTokens(connection);
    if (tokens.expiresAt.getTime() > Date.now() + 60_000) {
      return tokens;
    }
    try {
      const refreshed = await this.provider.refresh(tokens);
      await this.prisma.calendarConnection.update({
        where: { id: connection.id },
        data: {
          accessTokenEnc: this.crypto.encrypt(refreshed.accessToken),
          refreshTokenEnc: this.crypto.encrypt(refreshed.refreshToken),
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
