import { Module, forwardRef } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module';
import { CalendarModule } from '../calendar/calendar.module';
import { EventTypesModule } from '../event-types/event-types.module';
import { SchedulesModule } from '../schedules/schedules.module';
import { AvailabilityService } from './availability.service';

@Module({
  imports: [
    SchedulesModule,
    forwardRef(() => EventTypesModule),
    forwardRef(() => BookingsModule),
    CalendarModule,
  ],
  providers: [AvailabilityService],
  exports: [AvailabilityService],
})
export class AvailabilityModule {}
