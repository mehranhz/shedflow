import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { MailModule } from '../mail/mail.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { OutboxRelayService } from './outbox-relay.service';
import { OutboxWorker } from './outbox.worker';

@Module({
  imports: [MailModule, JobsModule, WebhooksModule],
  providers: [OutboxRelayService, OutboxWorker],
  exports: [OutboxRelayService],
})
export class OutboxModule {}
