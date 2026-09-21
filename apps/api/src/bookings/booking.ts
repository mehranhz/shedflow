import { BookingSource, BookingStatus, LocationType } from '@shedflow/db';
import type { BookingAnswers } from '@shedflow/shared';

export type BookingEntity = {
  id: string;
  uid: string;
  organizationId: string;
  eventTypeId: string;
  hostUserId: string;
  customerId: string;
  startAt: Date;
  endAt: Date;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  timezone: string;
  status: BookingStatus;
  source: BookingSource;
  locationType: LocationType;
  locationValue: string | null;
  answers: BookingAnswers;
  cancellationReason: string | null;
  rescheduledFromId: string | null;
  paymentId: string | null;
  subscriptionId: string | null;
  holdExpiresAt: Date | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateBookingData = {
  uid: string;
  organizationId: string;
  eventTypeId: string;
  hostUserId: string;
  customerId: string;
  startAt: Date;
  endAt: Date;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  timezone: string;
  status: BookingStatus;
  source: BookingSource;
  locationType: LocationType;
  locationValue?: string | null;
  answers?: BookingAnswers;
  rescheduledFromId?: string | null;
  holdExpiresAt?: Date | null;
  metadata?: Record<string, unknown>;
};

export type UpdateBookingData = Partial<{
  status: BookingStatus;
  cancellationReason: string | null;
  holdExpiresAt: Date | null;
  paymentId: string | null;
  subscriptionId: string | null;
  metadata: Record<string, unknown>;
  answers: BookingAnswers;
}>;

export type BookingListFilter = {
  status?: BookingStatus;
  from?: Date;
  to?: Date;
  eventTypeId?: string;
  hostUserId?: string;
  customerId?: string;
};
