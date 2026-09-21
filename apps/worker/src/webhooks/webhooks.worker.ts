import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PgBossService } from '../queue/pg-boss.service';
import { WebhookDispatchService } from './webhook-dispatch.service';
import {
  WEBHOOK_DISPATCH_QUEUE,
  type WebhookDispatchJobPayload,
} from './webhooks.constants';

@Injectable()
export class WebhooksWorker implements OnModuleInit {
  private readonly logger = new Logger(WebhooksWorker.name);

  constructor(
    private readonly boss: PgBossService,
    private readonly config: ConfigService,
    private readonly dispatcher: WebhookDispatchService,
  ) {}

  async onModuleInit(): Promise<void> {
    const polling =
      this.config.get<number>('OUTBOX_POLLING_INTERVAL_SECONDS') ?? 1;

    await this.boss.ensureQueue(WEBHOOK_DISPATCH_QUEUE);
    await this.boss.workQueue(
      WEBHOOK_DISPATCH_QUEUE,
      async (data) => {
        await this.dispatcher.dispatch(data as WebhookDispatchJobPayload);
      },
      polling,
    );

    // Periodically claim redeliver / delayed retries that lost their queue job.
    setInterval(() => {
      void this.dispatcher.claimPendingRetries().catch((error) => {
        this.logger.warn(
          `webhook retry claim failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
    }, Math.max(polling, 5) * 1000);

    this.logger.log('T-033 webhook dispatch worker registered');
  }
}
