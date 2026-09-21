import { Injectable, Logger } from '@nestjs/common';
import { BookingStatus } from '@shedflow/db';
import { DOMAIN_EVENTS } from '@shedflow/shared';
import {
  CALENDAR_FULL_SYNC_QUEUE,
  CALENDAR_INCREMENTAL_SYNC_QUEUE,
  CALENDAR_WRITE_QUEUE,
  calendarConnSingletonKey,
  calendarWriteSingletonKey,
  type CalendarSyncJobPayload,
  type CalendarWriteJobPayload,
} from '../calendar/calendar.constants';
import { PrismaService } from '../prisma/prisma.service';
import { DomainEventJob } from '../queue/pg-boss.service';
import { PgBossService } from '../queue/pg-boss.service';
import { BookingExpireService } from './booking-expire.service';
import { ReminderService } from './reminder.service';

@Injectable()
export class EventSideEffectsService {
  private readonly logger = new Logger(EventSideEffectsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reminders: ReminderService,
    private readonly expire: BookingExpireService,
    private readonly boss: PgBossService,
  ) {}

  async afterDomainEvent(job: DomainEventJob): Promise<void> {
    switch (job.type) {
      case DOMAIN_EVENTS.BookingConfirmed:
        await this.scheduleReminders(asString(job.payload.bookingId));
        await this.enqueueCalendarWrite(asString(job.payload.bookingId), 'upsert');
        return;
      case DOMAIN_EVENTS.BookingRescheduled:
        await this.scheduleReminders(asString(job.payload.toId));
        await this.enqueueCalendarWrite(asString(job.payload.fromId), 'delete');
        await this.enqueueCalendarWrite(asString(job.payload.toId), 'upsert');
        return;
      case DOMAIN_EVENTS.BookingCancelled:
        await this.enqueueCalendarWrite(asString(job.payload.bookingId), 'delete');
        return;
      case DOMAIN_EVENTS.BookingCreated:
        await this.expire.scheduleIfNeeded(asString(job.payload.bookingId) ?? '');
        return;
      case DOMAIN_EVENTS.CalendarConnectionReady: {
        const connectionId = asString(job.payload.connectionId);
        if (!connectionId) return;
        const incremental = job.payload.incremental === true;
        const queue = incremental
          ? CALENDAR_INCREMENTAL_SYNC_QUEUE
          : CALENDAR_FULL_SYNC_QUEUE;
        await this.boss.enqueueJob(
          queue,
          { connectionId } satisfies CalendarSyncJobPayload,
          { singletonKey: calendarConnSingletonKey(connectionId) },
        );
        this.logger.log(
          `enqueued ${queue} connection=${connectionId}`,
        );
        return;
      }
      default:
        return;
    }
  }

  private async enqueueCalendarWrite(
    bookingId: string | null,
    action: CalendarWriteJobPayload['action'],
  ): Promise<void> {
    if (!bookingId) return;
    await this.boss.enqueueJob(
      CALENDAR_WRITE_QUEUE,
      { bookingId, action } satisfies CalendarWriteJobPayload,
      { singletonKey: calendarWriteSingletonKey(bookingId, action) },
    );
    this.logger.log(`enqueued ${CALENDAR_WRITE_QUEUE} action=${action} booking=${bookingId}`);
  }

  private async scheduleReminders(bookingId: string | null): Promise<void> {
    if (!bookingId) {
      return;
    }
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });
    if (!booking || booking.status !== BookingStatus.CONFIRMED) {
      return;
    }
    const templates = await this.reminders.scheduleForBooking({
      bookingId: booking.id,
      startAt: booking.startAt,
    });
    this.logger.debug(
      `scheduled reminders [${templates.join(',')}] booking=${bookingId}`,
    );
  }
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
