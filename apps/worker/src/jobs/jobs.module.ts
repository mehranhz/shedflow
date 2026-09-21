import { Module } from '@nestjs/common';
import { CalendarModule } from '../calendar/calendar.module';
import { MailModule } from '../mail/mail.module';
import { QueueModule } from '../queue/queue.module';
import { BookingExpireService } from './booking-expire.service';
import { EventSideEffectsService } from './event-side-effects.service';
import { IdempotencyPurgeService } from './idempotency-purge.service';
import {
  HmacInternalBookingsClient,
  InternalBookingsClient,
} from './internal-bookings.client';
import { JobsWorker } from './jobs.worker';
import { ReminderService } from './reminder.service';

@Module({
  imports: [QueueModule, MailModule, CalendarModule],
  providers: [
    ReminderService,
    BookingExpireService,
    IdempotencyPurgeService,
    EventSideEffectsService,
    JobsWorker,
    { provide: InternalBookingsClient, useClass: HmacInternalBookingsClient },
  ],
  exports: [
    ReminderService,
    BookingExpireService,
    IdempotencyPurgeService,
    EventSideEffectsService,
  ],
})
export class JobsModule {}
