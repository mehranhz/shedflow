import { Module } from '@nestjs/common';
import { OutboxRelayService } from './outbox-relay.service';
import { OutboxWorker } from './outbox.worker';

@Module({
  providers: [OutboxRelayService, OutboxWorker],
  exports: [OutboxRelayService],
})
export class OutboxModule {}
