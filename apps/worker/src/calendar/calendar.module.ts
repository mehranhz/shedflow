import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QueueModule } from '../queue/queue.module';
import {
  CALENDAR_PROVIDER,
  MICROSOFT_CALENDAR_PROVIDER,
} from './calendar-provider';
import { CalendarSyncService } from './calendar-sync.service';
import { CalendarTokenService } from './calendar-token.service';
import { CalendarWriteService } from './calendar-write.service';
import { CalendarWorker } from './calendar.worker';
import { FakeCalendarProvider } from './fake-calendar.provider';
import { GoogleCalendarProvider } from './google-calendar.provider';
import { MicrosoftCalendarProvider } from './microsoft-calendar.provider';

@Module({
  imports: [QueueModule, ConfigModule],
  providers: [
    FakeCalendarProvider,
    GoogleCalendarProvider,
    MicrosoftCalendarProvider,
    {
      provide: CALENDAR_PROVIDER,
      inject: [ConfigService, FakeCalendarProvider, GoogleCalendarProvider],
      useFactory: (
        config: ConfigService,
        fake: FakeCalendarProvider,
        google: GoogleCalendarProvider,
      ) => {
        const clientId = config.get<string>('GOOGLE_CLIENT_ID')?.trim();
        if (!clientId || process.env.NODE_ENV === 'test') {
          return fake;
        }
        return google;
      },
    },
    {
      provide: MICROSOFT_CALENDAR_PROVIDER,
      useExisting: MicrosoftCalendarProvider,
    },
    CalendarTokenService,
    CalendarSyncService,
    CalendarWriteService,
    CalendarWorker,
  ],
  exports: [CalendarSyncService, CalendarWriteService, FakeCalendarProvider],
})
export class CalendarModule {}
