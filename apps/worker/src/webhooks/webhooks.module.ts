import { Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module';
import { WebhookDispatchService } from './webhook-dispatch.service';
import { WebhooksWorker } from './webhooks.worker';

@Module({
  imports: [QueueModule],
  providers: [WebhookDispatchService, WebhooksWorker],
  exports: [WebhookDispatchService],
})
export class WebhooksModule {}
