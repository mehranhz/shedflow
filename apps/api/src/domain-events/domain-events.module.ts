import { Global, Module } from '@nestjs/common';
import { JobQueue } from '../common/jobs/job-queue';
import { OutboxJobQueue } from '../common/jobs/outbox-job-queue';
import { DomainEventRepository } from './domain-event.repository';
import { Outbox } from './outbox';
import { PrismaDomainEventRepository } from './prisma-domain-event.repository';

@Global()
@Module({
  providers: [
    Outbox,
    OutboxJobQueue,
    { provide: JobQueue, useExisting: OutboxJobQueue },
    { provide: DomainEventRepository, useClass: PrismaDomainEventRepository },
  ],
  exports: [Outbox, JobQueue, DomainEventRepository],
})
export class DomainEventsModule {}
