import { Repository } from '../common/persistence';
import {
  CreateEventTypeData,
  EventTypeEntity,
  UpdateEventTypeData,
} from './event-type';

export abstract class EventTypeRepository extends Repository<
  EventTypeEntity,
  CreateEventTypeData,
  UpdateEventTypeData
> {
  abstract findInOrganization(
    organizationId: string,
    id: string,
  ): Promise<EventTypeEntity | null>;

  abstract findBySlug(
    organizationId: string,
    slug: string,
  ): Promise<EventTypeEntity | null>;

  abstract listByOrganization(
    organizationId: string,
  ): Promise<EventTypeEntity[]>;

  abstract listPublicByOrganization(
    organizationId: string,
  ): Promise<EventTypeEntity[]>;

  abstract countActive(organizationId: string): Promise<number>;

  abstract updateInOrganization(
    organizationId: string,
    id: string,
    data: UpdateEventTypeData,
  ): Promise<EventTypeEntity>;

  abstract lockForShare(organizationId: string, id: string): Promise<void>;
}
