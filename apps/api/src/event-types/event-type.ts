import { LocationType } from '@shedflow/db';
import type { EventTypeQuestions } from '@shedflow/shared';

export type EventTypeEntity = {
  id: string;
  organizationId: string;
  hostUserId: string;
  scheduleId: string;
  slug: string;
  title: string;
  description: string;
  durationMinutes: number;
  locationType: LocationType;
  locationValue: string | null;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  minNoticeMinutes: number;
  maxDaysAhead: number;
  slotIntervalMinutes: number;
  dailyCap: number | null;
  requiresConfirmation: boolean;
  cancellationNoticeHours: number;
  rescheduleNoticeHours: number;
  priceId: string | null;
  subscriptionProductId: string | null;
  creditCost: number;
  questions: EventTypeQuestions;
  isActive: boolean;
  isHidden: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateEventTypeData = {
  organizationId: string;
  hostUserId: string;
  scheduleId: string;
  slug: string;
  title: string;
  description?: string;
  durationMinutes: number;
  locationType: LocationType;
  locationValue?: string | null;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  minNoticeMinutes?: number;
  maxDaysAhead?: number;
  slotIntervalMinutes?: number;
  dailyCap?: number | null;
  requiresConfirmation?: boolean;
  cancellationNoticeHours?: number;
  rescheduleNoticeHours?: number;
  priceId?: string | null;
  subscriptionProductId?: string | null;
  creditCost?: number;
  questions?: EventTypeQuestions;
  isActive?: boolean;
  isHidden?: boolean;
};

export type UpdateEventTypeData = Partial<
  Omit<CreateEventTypeData, 'organizationId' | 'hostUserId'>
> & {
  hostUserId?: string;
};
