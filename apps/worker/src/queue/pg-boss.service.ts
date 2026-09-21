import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PgBoss, type QueuePolicy, type SendOptions } from 'pg-boss';
import {
  eventQueueName,
  OUTBOX_RELAY_QUEUE,
  PGBOSS_SCHEMA,
} from '../outbox/outbox.constants';

export type DomainEventJob = {
  eventId: string;
  type: string;
  organizationId: string | null;
  payload: Record<string, unknown>;
  attempts: number;
};

@Injectable()
export class PgBossService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PgBossService.name);
  private boss: PgBoss | null = null;
  private readonly queues = new Set<string>();
  private readonly workers = new Set<string>();

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const connectionString = this.config.getOrThrow<string>('DATABASE_URL');
    const boss = new PgBoss({
      connectionString,
      schema: PGBOSS_SCHEMA,
      useListenNotify: true,
    });
    boss.on('error', (error) => {
      this.logger.error(error);
    });
    await boss.start();
    await boss.createQueue(OUTBOX_RELAY_QUEUE, {
      policy: 'singleton',
      notify: true,
    });
    this.queues.add(OUTBOX_RELAY_QUEUE);
    this.boss = boss;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.boss) {
      await this.boss.stop({ graceful: false, timeout: 5_000 });
    }
    this.boss = null;
  }

  client(): PgBoss {
    if (!this.boss) {
      throw new Error('pg-boss is not started');
    }
    return this.boss;
  }

  async ensureQueue(
    name: string,
    options?: { policy?: QueuePolicy },
  ): Promise<void> {
    if (this.queues.has(name)) {
      return;
    }
    await this.client().createQueue(name, {
      notify: true,
      ...(options?.policy ? { policy: options.policy } : {}),
    });
    this.queues.add(name);
  }

  async sendRelayTick(): Promise<void> {
    await this.client().send(OUTBOX_RELAY_QUEUE, {});
  }

  async enqueueDomainEvent(job: DomainEventJob): Promise<void> {
    const queue = eventQueueName(job.type);
    await this.ensureQueue(queue);
    await this.client().send(queue, job, {
      singletonKey: `${job.eventId}:${job.attempts}`,
    });
  }

  async enqueueJob(
    queue: string,
    data: object,
    options?: SendOptions,
  ): Promise<string | null> {
    await this.ensureQueue(queue);
    return this.client().send(queue, data, options ?? {});
  }

  async scheduleCron(
    queue: string,
    cron: string,
    data: object = {},
    options?: { tz?: string },
  ): Promise<void> {
    await this.ensureQueue(queue);
    await this.client().schedule(queue, cron, data, {
      tz: options?.tz ?? 'UTC',
    });
  }

  async workRelay(
    handler: () => Promise<void>,
    pollingIntervalSeconds = 1,
  ): Promise<void> {
    if (this.workers.has(OUTBOX_RELAY_QUEUE)) {
      return;
    }
    this.workers.add(OUTBOX_RELAY_QUEUE);
    await this.client().work(
      OUTBOX_RELAY_QUEUE,
      { pollingIntervalSeconds },
      async () => {
        await handler();
      },
    );
  }

  async workEventQueue(
    type: string,
    handler: (job: DomainEventJob) => Promise<void>,
    pollingIntervalSeconds = 1,
  ): Promise<void> {
    const queue = eventQueueName(type);
    if (this.workers.has(queue)) {
      return;
    }
    await this.ensureQueue(queue);
    this.workers.add(queue);
    await this.client().work(
      queue,
      { pollingIntervalSeconds },
      async (jobs?: Array<{ data: DomainEventJob }>) => {
        for (const job of jobs ?? []) {
          await handler(job.data);
        }
      },
    );
  }

  async workQueue(
    queue: string,
    handler: (data: Record<string, unknown>) => Promise<void>,
    pollingIntervalSeconds = 1,
  ): Promise<void> {
    if (this.workers.has(queue)) {
      return;
    }
    await this.ensureQueue(queue);
    this.workers.add(queue);
    await this.client().work(
      queue,
      { pollingIntervalSeconds },
      async (jobs?: Array<{ data: Record<string, unknown> }>) => {
        for (const job of jobs ?? []) {
          await handler(job.data ?? {});
        }
      },
    );
  }
}
