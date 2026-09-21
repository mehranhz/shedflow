import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PgBossService } from '../queue/pg-boss.service';
import {
  CALENDAR_FULL_SYNC_QUEUE,
  CALENDAR_INCREMENTAL_SYNC_QUEUE,
  CALENDAR_POLL_QUEUE,
  CALENDAR_RENEW_WATCH_QUEUE,
  CALENDAR_WRITE_QUEUE,
  type CalendarSyncJobPayload,
  type CalendarWriteJobPayload,
} from './calendar.constants';
import { CalendarSyncService } from './calendar-sync.service';
import { CalendarWriteService } from './calendar-write.service';

@Injectable()
export class CalendarWorker implements OnModuleInit {
  private readonly logger = new Logger(CalendarWorker.name);

  constructor(
    private readonly boss: PgBossService,
    private readonly config: ConfigService,
    private readonly sync: CalendarSyncService,
    private readonly write: CalendarWriteService,
  ) {}

  async onModuleInit(): Promise<void> {
    const polling =
      this.config.get<number>('OUTBOX_POLLING_INTERVAL_SECONDS') ?? 1;

    await this.boss.ensureQueue(CALENDAR_FULL_SYNC_QUEUE);
    await this.boss.ensureQueue(CALENDAR_INCREMENTAL_SYNC_QUEUE, {
      policy: 'singleton',
    });
    await this.boss.ensureQueue(CALENDAR_WRITE_QUEUE, { policy: 'stately' });
    await this.boss.ensureQueue(CALENDAR_RENEW_WATCH_QUEUE);
    await this.boss.ensureQueue(CALENDAR_POLL_QUEUE);

    await this.boss.workQueue(
      CALENDAR_FULL_SYNC_QUEUE,
      async (data) => {
        await this.sync.fullSync(data as CalendarSyncJobPayload);
      },
      polling,
    );
    await this.boss.workQueue(
      CALENDAR_INCREMENTAL_SYNC_QUEUE,
      async (data) => {
        await this.sync.incrementalSync(data as CalendarSyncJobPayload);
      },
      polling,
    );
    await this.boss.workQueue(
      CALENDAR_WRITE_QUEUE,
      async (data) => {
        await this.write.handle(data as CalendarWriteJobPayload);
      },
      polling,
    );
    await this.boss.workQueue(
      CALENDAR_RENEW_WATCH_QUEUE,
      async () => {
        await this.sync.renewAllWatches();
      },
      polling,
    );
    await this.boss.workQueue(
      CALENDAR_POLL_QUEUE,
      async () => {
        await this.sync.pollAll();
      },
      polling,
    );

    await this.boss.scheduleCron(CALENDAR_RENEW_WATCH_QUEUE, '0 4 * * *', {}, {
      tz: 'UTC',
    });
    await this.boss.scheduleCron(CALENDAR_POLL_QUEUE, '*/5 * * * *', {}, {
      tz: 'UTC',
    });

    this.logger.log('T-016 calendar workers registered');
  }
}
