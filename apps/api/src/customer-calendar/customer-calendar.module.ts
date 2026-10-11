import { Module } from '@nestjs/common';
import { CalendarModule } from '../calendar/calendar.module';
import {
  CustomerCalendarController,
  PublicCustomerCalendarController,
} from './customer-calendar.controller';
import { CustomerCalendarService } from './customer-calendar.service';

@Module({
  imports: [CalendarModule],
  controllers: [
    CustomerCalendarController,
    PublicCustomerCalendarController,
  ],
  providers: [CustomerCalendarService],
  exports: [CustomerCalendarService],
})
export class CustomerCalendarModule {}
