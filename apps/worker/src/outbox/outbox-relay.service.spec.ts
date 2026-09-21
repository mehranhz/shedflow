import { ConfigService } from '@nestjs/config';
import { DomainEventStatus } from '@shedflow/db';
import { EventSideEffectsService } from '../jobs/event-side-effects.service';
import { NotificationDispatcher } from '../mail/notification-dispatcher';
import { PrismaService } from '../prisma/prisma.service';
import { PgBossService } from '../queue/pg-boss.service';
import { OutboxRelayService } from './outbox-relay.service';

jest.mock('../queue/pg-boss.service', () => ({
  PgBossService: class PgBossService {},
}));

describe('OutboxRelayService.handleEvent', () => {
  const job = {
    eventId: 'evt-1',
    type: 'organization.created',
    organizationId: 'org-1',
    payload: { ping: true },
    attempts: 0,
  };

  function createService(attempts: number, maxAttempts = 10) {
    const prisma = {
      domainEvent: {
        update: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue({
          id: job.eventId,
          attempts,
        }),
      },
    };
    const boss = {};
    const config = {
      get: (key: string) => {
        if (key === 'OUTBOX_MAX_ATTEMPTS') {
          return maxAttempts;
        }
        if (key === 'OUTBOX_BACKOFF_MS') {
          return 1000;
        }
        return undefined;
      },
    };
    const notifications = {
      handle: jest.fn().mockResolvedValue(undefined),
    };
    const sideEffects = {
      afterDomainEvent: jest.fn().mockResolvedValue(undefined),
    };
    const webhooks = {
      afterDomainEvent: jest.fn().mockResolvedValue(undefined),
    };
    const service = new OutboxRelayService(
      prisma as unknown as PrismaService,
      boss as unknown as PgBossService,
      config as unknown as ConfigService,
      notifications as unknown as NotificationDispatcher,
      sideEffects as unknown as EventSideEffectsService,
      webhooks as never,
    );
    return { service, prisma, notifications, sideEffects, webhooks };
  }

  it('marks the row PROCESSED after notifying handlers', async () => {
    const { service, prisma, notifications, sideEffects, webhooks } =
      createService(0);
    await service.handleEvent(job);
    expect(notifications.handle).toHaveBeenCalledWith(job);
    expect(sideEffects.afterDomainEvent).toHaveBeenCalledWith(job);
    expect(webhooks.afterDomainEvent).toHaveBeenCalledWith(job);
    expect(prisma.domainEvent.update).toHaveBeenCalledWith({
      where: { id: job.eventId },
      data: {
        status: DomainEventStatus.PROCESSED,
        processedAt: expect.any(Date),
        lastError: null,
      },
    });
  });

  it('backs off a poison payload and marks FAILED at max attempts', async () => {
    const poison = {
      ...job,
      type: 'test.poison',
      payload: { poison: true },
    };

    const retry = createService(0, 10);
    await retry.service.handleEvent(poison);
    expect(retry.notifications.handle).not.toHaveBeenCalled();
    expect(retry.sideEffects.afterDomainEvent).not.toHaveBeenCalled();
    expect(retry.prisma.domainEvent.update).toHaveBeenCalledWith({
      where: { id: poison.eventId },
      data: {
        status: DomainEventStatus.PENDING,
        attempts: 1,
        lastError: 'poison payload',
        availableAt: expect.any(Date),
      },
    });

    const failed = createService(9, 10);
    await failed.service.handleEvent(poison);
    expect(failed.prisma.domainEvent.update).toHaveBeenCalledWith({
      where: { id: poison.eventId },
      data: {
        status: DomainEventStatus.FAILED,
        attempts: 10,
        lastError: 'poison payload',
        processedAt: expect.any(Date),
      },
    });
  });
});
