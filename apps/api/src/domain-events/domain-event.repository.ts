import { Repository } from '../common/persistence';
import {
  CreateDomainEventData,
  DomainEvent,
  UpdateDomainEventData,
} from './domain-event';

export abstract class DomainEventRepository extends Repository<
  DomainEvent,
  CreateDomainEventData,
  UpdateDomainEventData
> {
  abstract findInOrganization(
    organizationId: string,
    id: string,
  ): Promise<DomainEvent | null>;

  abstract listByOrganization(organizationId: string): Promise<DomainEvent[]>;

  abstract listPending(now: Date, limit: number): Promise<DomainEvent[]>;
}
