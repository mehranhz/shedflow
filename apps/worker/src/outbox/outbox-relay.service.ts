import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainEventStatus, Prisma } from '@shedflow/db';
import { PrismaService } from '../prisma/prisma.service';
import { DomainEventJob, PgBossService } from '../queue/pg-boss.service';
import {
  ClaimedOutboxRow,
  nextOutboxAttempt,
  OUTBOX_BATCH_SIZE,
  OUTBOX_LEASE_MS,
  POISON_EVENT_TYPE,
} from './outbox.constants';

type RawOutboxRow = {
  id: string;
  organization_id: string | null;
  type: string;
  payload: Prisma.JsonValue;
  attempts: number | bigint;
};

@Injectable()
export class OutboxRelayService {
  private readonly logger = new Logger(OutboxRelayService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly boss: PgBossService,
    private readonly config: ConfigService,
  ) {}

  async relay(): Promise<number> {
    const claimed = await this.claimPending();
    for (const row of claimed) {
      await this.boss.workEventQueue(row.type, (job) => this.handleEvent(job));
      await this.boss.enqueueDomainEvent({
        eventId: row.id,
        type: row.type,
        organizationId: row.organizationId,
        payload: row.payload,
      });
    }
    if (claimed.length > 0) {
      this.logger.debug(`relayed ${claimed.length} domain_events`);
    }
    return claimed.length;
  }

  async handleEvent(job: DomainEventJob): Promise<void> {
    const now = new Date();
    try {
      this.assertNotPoison(job);
      this.logger.log(`domain_event ${job.type} id=${job.eventId}`);
      await this.prisma.domainEvent.update({
        where: { id: job.eventId },
        data: {
          status: DomainEventStatus.PROCESSED,
          processedAt: now,
          lastError: null,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.recordFailure(job.eventId, message, now);
    }
  }

  private assertNotPoison(job: DomainEventJob): void {
    if (job.type === POISON_EVENT_TYPE || job.payload.poison === true) {
      throw new Error('poison payload');
    }
  }

  private async recordFailure(
    eventId: string,
    message: string,
    now: Date,
  ): Promise<void> {
    const maxAttempts = this.config.get<number>('OUTBOX_MAX_ATTEMPTS') ?? 10;
    const backoffMs = this.config.get<number>('OUTBOX_BACKOFF_MS') ?? 1000;
    const current = await this.prisma.domainEvent.findUnique({
      where: { id: eventId },
    });
    if (!current) {
      return;
    }

    const next = nextOutboxAttempt({
      attempts: current.attempts,
      error: message,
      now,
      maxAttempts,
      backoffMs,
    });

    if (next.status === 'FAILED') {
      await this.prisma.domainEvent.update({
        where: { id: eventId },
        data: {
          status: DomainEventStatus.FAILED,
          attempts: next.attempts,
          lastError: next.lastError,
          processedAt: next.processedAt,
        },
      });
      this.logger.warn(
        `domain_event ${eventId} FAILED after ${next.attempts} attempts`,
      );
      return;
    }

    await this.prisma.domainEvent.update({
      where: { id: eventId },
      data: {
        status: DomainEventStatus.PENDING,
        attempts: next.attempts,
        lastError: next.lastError,
        availableAt: next.availableAt,
      },
    });
  }

  private async claimPending(): Promise<ClaimedOutboxRow[]> {
    const leaseUntil = new Date(Date.now() + OUTBOX_LEASE_MS);
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<RawOutboxRow[]>`
        SELECT id, organization_id, type, payload, attempts
        FROM domain_events
        WHERE status = 'PENDING'::"DomainEventStatus"
          AND available_at <= NOW()
        ORDER BY available_at ASC
        LIMIT ${Prisma.raw(String(OUTBOX_BATCH_SIZE))}
        FOR UPDATE SKIP LOCKED
      `;
      if (rows.length === 0) {
        return [];
      }
      await tx.domainEvent.updateMany({
        where: { id: { in: rows.map((row) => row.id) } },
        data: { availableAt: leaseUntil },
      });
      return rows.map((row) => ({
        id: row.id,
        organizationId: row.organization_id,
        type: row.type,
        payload: asJsonObject(row.payload),
        attempts: Number(row.attempts),
      }));
    });
  }
}

function asJsonObject(value: Prisma.JsonValue): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}
