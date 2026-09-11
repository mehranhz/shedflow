import { Injectable } from '@nestjs/common';
import { Outbox } from '../../domain-events/outbox';
import { JobQueue } from './job-queue';

@Injectable()
export class OutboxJobQueue extends JobQueue {
  constructor(private readonly outbox: Outbox) {
    super();
  }

  async enqueue(
    type: string,
    payload: Record<string, unknown>,
    organizationId?: string | null,
  ): Promise<void> {
    await this.outbox.emit(type, payload, organizationId);
  }
}
