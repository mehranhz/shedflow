import { Module, forwardRef } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module';
import { EventTypesModule } from '../event-types/event-types.module';
import { SchedulesModule } from '../schedules/schedules.module';
import { AvailabilityService } from './availability.service';

@Module({
  imports: [
    SchedulesModule,
    forwardRef(() => EventTypesModule),
    forwardRef(() => BookingsModule),
  ],
  providers: [AvailabilityService],
  exports: [AvailabilityService],
})
export class AvailabilityModule {}
