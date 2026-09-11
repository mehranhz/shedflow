import { Injectable } from '@nestjs/common';
import { TransactionManager } from '../common/persistence';
import { DomainEvent } from './domain-event';
import { DomainEventRepository } from './domain-event.repository';

@Injectable()
export class Outbox {
  constructor(
    private readonly events: DomainEventRepository,
    private readonly transactions: TransactionManager,
  ) {}

  /**
   * Writes a `domain_events` row. Must run inside
   * {@link TransactionManager.runInTransaction} so the HTTP mutation and the
   * outbox insert commit together. The worker (T-009) relays PENDING rows.
   */
  async emit(
    type: string,
    payload: Record<string, unknown>,
    organizationId?: string | null,
  ): Promise<DomainEvent> {
    if (!this.transactions.isInTransaction()) {
      throw new Error(
        'Outbox.emit must be called inside TransactionManager.runInTransaction',
      );
    }

    return this.events.create({
      type,
      payload,
      organizationId: organizationId ?? null,
    });
  }
}
