import { BookingStatus } from '@shedflow/db';
import { Page, PageRequest, Repository } from '../common/persistence';
import {
  BookingEntity,
  BookingListFilter,
  CreateBookingData,
  UpdateBookingData,
} from './booking';

export abstract class BookingRepository extends Repository<
  BookingEntity,
  CreateBookingData,
  UpdateBookingData
> {
  abstract findInOrganization(
    organizationId: string,
    id: string,
  ): Promise<BookingEntity | null>;

  abstract findByUid(uid: string): Promise<BookingEntity | null>;

  abstract listInOrganization(
    organizationId: string,
    filter: BookingListFilter,
    request?: PageRequest<BookingEntity>,
  ): Promise<Page<BookingEntity>>;

  abstract listOccupiedForHost(
    hostUserId: string,
    from: Date,
    to: Date,
    statuses: BookingStatus[],
  ): Promise<BookingEntity[]>;

  abstract countByEventTypeLocalDays(
    eventTypeId: string,
    timeZone: string,
    from: Date,
    to: Date,
    statuses: BookingStatus[],
  ): Promise<Map<string, number>>;

  abstract updateInOrganization(
    organizationId: string,
    id: string,
    data: UpdateBookingData,
  ): Promise<BookingEntity>;

  abstract casStatus(
    id: string,
    fromStatus: BookingStatus,
    toStatus: BookingStatus,
    extra?: UpdateBookingData,
  ): Promise<BookingEntity | null>;

  /** GDPR erasure: wipe invitee answers; keep time rows for host calendar. */
  abstract clearAnswersForCustomer(
    organizationId: string,
    customerId: string,
  ): Promise<number>;
}
