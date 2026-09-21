import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PgBossService } from '../queue/pg-boss.service';
import { BookingExpireService } from './booking-expire.service';
import { IdempotencyPurgeService } from './idempotency-purge.service';
import {
  BOOKING_EXPIRE_QUEUE,
  IDEMPOTENCY_PURGE_QUEUE,
  REMINDER_SEND_QUEUE,
  type BookingExpireJobPayload,
  type ReminderJobPayload,
} from './jobs.constants';
import { ReminderService } from './reminder.service';

@Injectable()
export class JobsWorker implements OnModuleInit {
  private readonly logger = new Logger(JobsWorker.name);

  constructor(
    private readonly boss: PgBossService,
    private readonly config: ConfigService,
    private readonly reminders: ReminderService,
    private readonly expire: BookingExpireService,
    private readonly purge: IdempotencyPurgeService,
  ) {}

  async onModuleInit(): Promise<void> {
    const polling =
      this.config.get<number>('OUTBOX_POLLING_INTERVAL_SECONDS') ?? 1;

    await this.boss.ensureQueue(REMINDER_SEND_QUEUE, { policy: 'stately' });
    await this.boss.ensureQueue(BOOKING_EXPIRE_QUEUE, { policy: 'stately' });
    await this.boss.ensureQueue(IDEMPOTENCY_PURGE_QUEUE);

    await this.boss.workQueue(
      REMINDER_SEND_QUEUE,
      async (data) => {
        await this.reminders.handleSend(data as ReminderJobPayload);
      },
      polling,
    );

    await this.boss.workQueue(
      BOOKING_EXPIRE_QUEUE,
      async (data) => {
        await this.expire.handleExpire(data as BookingExpireJobPayload);
      },
      polling,
    );

    await this.boss.workQueue(
      IDEMPOTENCY_PURGE_QUEUE,
      async () => {
        await this.purge.purgeExpired();
      },
      polling,
    );

    await this.purge.registerSchedule();
    this.logger.log('T-026 job workers registered');
  }
}
