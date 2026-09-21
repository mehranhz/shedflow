import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CalendarProvider as CalendarProviderEnum } from '@shedflow/db';
import { PrismaService } from '../prisma/prisma.service';
import { PgBossService } from '../queue/pg-boss.service';
import {
  CALENDAR_INCREMENTAL_SYNC_QUEUE,
  calendarConnSingletonKey,
  type CalendarSyncJobPayload,
} from './calendar.constants';
import { CalendarTokenService } from './calendar-token.service';

const FULL_SYNC_PAST_MS = 30 * 24 * 60 * 60 * 1000;
const FULL_SYNC_FUTURE_MS = 90 * 24 * 60 * 60 * 1000;

@Injectable()
export class CalendarSyncService {
  private readonly logger = new Logger(CalendarSyncService.name);
  private readonly webhookUrl: string;
  private readonly microsoftWebhookUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: CalendarTokenService,
    private readonly boss: PgBossService,
    config: ConfigService,
  ) {
    this.webhookUrl =
      config.get<string>('GOOGLE_WEBHOOK_URL')?.trim() ||
      `${(config.get<string>('API_URL') ?? 'http://localhost:3001').replace(/\/$/, '')}/webhooks/google-calendar`;
    this.microsoftWebhookUrl =
      config.get<string>('MICROSOFT_WEBHOOK_URL')?.trim() ||
      `${(config.get<string>('API_URL') ?? 'http://localhost:3001').replace(/\/$/, '')}/webhooks/microsoft-calendar`;
  }

  async fullSync(payload: CalendarSyncJobPayload): Promise<void> {
    const connection = await this.loadConnection(payload.connectionId);
    if (!connection || connection.needsReauth) {
      return;
    }
    const provider = this.tokens.providerFor(connection.provider);
    const auth = await this.tokens.ensureFreshTokens(connection);
    const conflict = connection.calendars.filter((c) => c.conflictCheck);
    const syncMap = this.tokens.readSyncTokenMap(connection.syncToken);
    const from = new Date(Date.now() - FULL_SYNC_PAST_MS);
    const to = new Date(Date.now() + FULL_SYNC_FUTURE_MS);

    for (const calendar of conflict) {
      const result = await provider.fullSync(
        auth,
        calendar.externalId,
        from,
        to,
      );
      await this.replaceBusyBlocks(
        calendar.id,
        connection.userId,
        result.upserts,
      );
      syncMap[calendar.externalId] = result.nextSyncToken;
    }

    await this.prisma.calendarConnection.update({
      where: { id: connection.id },
      data: {
        syncToken: this.tokens.writeSyncTokenMap(syncMap),
        lastSyncedAt: new Date(),
      },
    });

    await this.ensureWatch(connection.id);
    this.logger.log(
      `calendar.full_sync connection=${connection.id} calendars=${conflict.length}`,
    );
  }

  async incrementalSync(payload: CalendarSyncJobPayload): Promise<void> {
    const connection = await this.loadConnection(payload.connectionId);
    if (!connection || connection.needsReauth) {
      return;
    }
    const provider = this.tokens.providerFor(connection.provider);
    const auth = await this.tokens.ensureFreshTokens(connection);
    const conflict = connection.calendars.filter((c) => c.conflictCheck);
    const syncMap = this.tokens.readSyncTokenMap(connection.syncToken);

    for (const calendar of conflict) {
      const existing = syncMap[calendar.externalId];
      if (!existing) {
        await this.fullSync({ connectionId: connection.id });
        return;
      }
      try {
        const result = await provider.incrementalSync(
          auth,
          calendar.externalId,
          existing,
        );
        for (const id of result.deletes) {
          await this.prisma.externalBusyBlock.deleteMany({
            where: {
              connectedCalendarId: calendar.id,
              externalEventId: id,
            },
          });
        }
        for (const block of result.upserts) {
          await this.prisma.externalBusyBlock.upsert({
            where: {
              connectedCalendarId_externalEventId: {
                connectedCalendarId: calendar.id,
                externalEventId: block.externalEventId,
              },
            },
            create: {
              connectedCalendarId: calendar.id,
              hostUserId: connection.userId,
              startAt: block.start,
              endAt: block.end,
              externalEventId: block.externalEventId,
              etag: block.etag,
            },
            update: {
              startAt: block.start,
              endAt: block.end,
              etag: block.etag ?? null,
            },
          });
        }
        syncMap[calendar.externalId] = result.nextSyncToken;
      } catch (error) {
        if (isHttpStatus(error, 410)) {
          await this.fullSync({ connectionId: connection.id });
          return;
        }
        throw error;
      }
    }

    await this.prisma.calendarConnection.update({
      where: { id: connection.id },
      data: {
        syncToken: this.tokens.writeSyncTokenMap(syncMap),
        lastSyncedAt: new Date(),
      },
    });
    this.logger.log(`calendar.incremental_sync connection=${connection.id}`);
  }

  async renewAllWatches(): Promise<void> {
    const connections = await this.prisma.calendarConnection.findMany({
      where: { needsReauth: false },
      select: { id: true },
    });
    for (const row of connections) {
      await this.ensureWatch(row.id);
    }
    this.logger.log(`calendar.renew_watch count=${connections.length}`);
  }

  async pollAll(): Promise<void> {
    const connections = await this.prisma.calendarConnection.findMany({
      where: { needsReauth: false },
      select: { id: true },
    });
    for (const row of connections) {
      await this.boss.enqueueJob(
        CALENDAR_INCREMENTAL_SYNC_QUEUE,
        { connectionId: row.id } satisfies CalendarSyncJobPayload,
        { singletonKey: calendarConnSingletonKey(row.id) },
      );
    }
    this.logger.debug(`calendar.poll enqueued=${connections.length}`);
  }

  private async ensureWatch(connectionId: string): Promise<void> {
    const connection = await this.loadConnection(connectionId);
    if (!connection || connection.needsReauth) {
      return;
    }
    const target =
      connection.calendars.find((c) => c.conflictCheck) ??
      connection.calendars[0];
    if (!target) {
      return;
    }
    const soon = Date.now() + 24 * 60 * 60 * 1000;
    if (
      connection.channelId &&
      connection.channelExpiresAt &&
      connection.channelExpiresAt.getTime() > soon
    ) {
      return;
    }
    const provider = this.tokens.providerFor(connection.provider);
    const hook =
      connection.provider === CalendarProviderEnum.MICROSOFT
        ? this.microsoftWebhookUrl
        : this.webhookUrl;
    try {
      const auth = await this.tokens.ensureFreshTokens(connection);
      if (connection.channelId && connection.resourceId) {
        try {
          await provider.stopWatch(
            auth,
            connection.channelId,
            connection.resourceId,
          );
        } catch {
          // ignore stop failures
        }
      }
      const watch = await provider.watch(auth, target.externalId, hook);
      await this.prisma.calendarConnection.update({
        where: { id: connection.id },
        data: {
          channelId: watch.channelId,
          resourceId: watch.resourceId,
          channelExpiresAt: watch.expiresAt,
        },
      });
    } catch (error) {
      this.logger.warn(
        `watch failed connection=${connectionId} err=${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async replaceBusyBlocks(
    connectedCalendarId: string,
    hostUserId: string,
    upserts: Array<{
      start: Date;
      end: Date;
      externalEventId: string;
      etag?: string;
    }>,
  ): Promise<void> {
    await this.prisma.externalBusyBlock.deleteMany({
      where: { connectedCalendarId },
    });
    for (const block of upserts) {
      await this.prisma.externalBusyBlock.create({
        data: {
          connectedCalendarId,
          hostUserId,
          startAt: block.start,
          endAt: block.end,
          externalEventId: block.externalEventId,
          etag: block.etag,
        },
      });
    }
  }

  private async loadConnection(connectionId: string) {
    return this.prisma.calendarConnection.findUnique({
      where: { id: connectionId },
      include: { calendars: true },
    });
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
