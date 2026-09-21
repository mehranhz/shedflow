import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebhookDeliveryStatus } from '@shedflow/db';
import {
  assertSafeWebhookUrlResolved,
  signWebhookPayload,
  webhookRetryDelayMs,
} from '@shedflow/shared';
import { createDecipheriv, createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { DomainEventJob, PgBossService } from '../queue/pg-boss.service';
import {
  endpointMatchesEvent,
  WEBHOOK_DISPATCH_QUEUE,
  type WebhookDispatchJobPayload,
} from './webhooks.constants';

const ALGO = 'aes-256-gcm';

function resolveKey(raw?: string): Buffer {
  if (raw && /^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  const seed = raw && raw.length > 0 ? raw : process.env.JWT_SECRET ?? 'dev';
  return createHash('sha256').update(seed).digest();
}

function decryptSecret(payload: Buffer, encryptionKey?: string): string {
  const key = resolveKey(encryptionKey ?? process.env.TOKEN_ENCRYPTION_KEY);
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString('utf8');
}

@Injectable()
export class WebhookDispatchService {
  private readonly logger = new Logger(WebhookDispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly boss: PgBossService,
    private readonly config: ConfigService,
  ) {}

  async afterDomainEvent(job: DomainEventJob): Promise<void> {
    if (!job.organizationId) {
      return;
    }
    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: { organizationId: job.organizationId, isActive: true },
    });
    for (const endpoint of endpoints) {
      if (!endpointMatchesEvent(endpoint.events, job.type)) {
        continue;
      }
      const delivery = await this.prisma.webhookDelivery.create({
        data: {
          endpointId: endpoint.id,
          eventId: job.eventId,
        },
      });
      await this.enqueue(delivery.id);
    }
  }

  async enqueue(deliveryId: string, startAfter?: Date): Promise<void> {
    await this.boss.enqueueJob(
      WEBHOOK_DISPATCH_QUEUE,
      { deliveryId } satisfies WebhookDispatchJobPayload,
      {
        singletonKey: `webhook:${deliveryId}:${startAfter?.getTime() ?? 'now'}`,
        ...(startAfter ? { startAfter } : {}),
      },
    );
  }

  async claimPendingRetries(limit = 50): Promise<number> {
    const now = new Date();
    const pending = await this.prisma.webhookDelivery.findMany({
      where: {
        status: WebhookDeliveryStatus.PENDING,
        nextRetryAt: { lte: now },
      },
      take: limit,
      orderBy: { nextRetryAt: 'asc' },
    });
    for (const row of pending) {
      await this.enqueue(row.id);
    }
    return pending.length;
  }

  async dispatch(payload: WebhookDispatchJobPayload): Promise<void> {
    const delivery = await this.prisma.webhookDelivery.findUnique({
      where: { id: payload.deliveryId },
      include: { endpoint: true },
    });
    if (!delivery || !delivery.endpoint.isActive) {
      return;
    }
    if (delivery.status === WebhookDeliveryStatus.SUCCESS) {
      return;
    }

    const event = await this.prisma.domainEvent.findUnique({
      where: { id: delivery.eventId },
    });
    if (!event) {
      await this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: WebhookDeliveryStatus.FAILED,
          lastError: 'Domain event not found',
        },
      });
      return;
    }

    const bodyObject = {
      id: `evt_${event.id.replace(/-/g, '').slice(0, 24)}`,
      type: event.type,
      createdAt: event.createdAt.toISOString(),
      organizationId: event.organizationId,
      data: event.payload,
    };
    const rawBody = JSON.stringify(bodyObject);
    const timestamp = Math.floor(Date.now() / 1000);

    let secret: string;
    try {
      secret = decryptSecret(
        Buffer.from(delivery.endpoint.secretEnc),
        this.config.get<string>('TOKEN_ENCRYPTION_KEY'),
      );
    } catch (error) {
      await this.failPermanent(
        delivery.id,
        error instanceof Error ? error.message : 'Secret decrypt failed',
      );
      return;
    }

    const signature = signWebhookPayload(secret, timestamp, rawBody);

    try {
      await assertSafeWebhookUrlResolved(delivery.endpoint.url);
    } catch (error) {
      await this.failPermanent(
        delivery.id,
        error instanceof Error ? error.message : 'SSRF blocked',
      );
      return;
    }

    const attempt = delivery.attempt + 1;
    let statusCode: number | null = null;
    let errorMessage: string | null = null;
    let ok = false;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      try {
        const response = await fetch(delivery.endpoint.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-SchedFlow-Event': event.type,
            'X-SchedFlow-Delivery': delivery.id,
            'X-SchedFlow-Timestamp': String(timestamp),
            'X-SchedFlow-Signature': signature,
          },
          body: rawBody,
          signal: controller.signal,
        });
        statusCode = response.status;
        ok = response.status >= 200 && response.status < 300;
        if (!ok) {
          errorMessage = `HTTP ${response.status}`;
        }
      } finally {
        clearTimeout(timer);
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    }

    if (ok) {
      await this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: WebhookDeliveryStatus.SUCCESS,
          attempt,
          lastStatus: statusCode,
          lastError: null,
          nextRetryAt: null,
        },
      });
      return;
    }

    const delay = webhookRetryDelayMs(attempt);
    if (delay === null) {
      await this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: WebhookDeliveryStatus.FAILED,
          attempt,
          lastStatus: statusCode,
          lastError: errorMessage,
          nextRetryAt: null,
        },
      });
      this.logger.warn(
        `webhook delivery ${delivery.id} FAILED after ${attempt} attempts`,
      );
      return;
    }

    const nextRetryAt = new Date(Date.now() + delay);
    await this.prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: WebhookDeliveryStatus.PENDING,
        attempt,
        lastStatus: statusCode,
        lastError: errorMessage,
        nextRetryAt,
      },
    });
    await this.enqueue(delivery.id, nextRetryAt);
  }

  private async failPermanent(id: string, message: string): Promise<void> {
    await this.prisma.webhookDelivery.update({
      where: { id },
      data: {
        status: WebhookDeliveryStatus.FAILED,
        lastError: message,
        nextRetryAt: null,
      },
    });
  }
}
