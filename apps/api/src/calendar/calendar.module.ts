import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { DomainEventsModule } from '../domain-events/domain-events.module';
import { MembershipsModule } from '../memberships/memberships.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { CALENDAR_PROVIDER } from './calendar-provider';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';
import { FakeCalendarProvider } from './fake-calendar.provider';
import { GoogleCalendarProvider } from './google-calendar.provider';
import { GoogleCalendarWebhookController } from './google-calendar-webhook.controller';

@Module({
  imports: [
    DomainEventsModule,
    MembershipsModule,
    OrganizationsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [CalendarController, GoogleCalendarWebhookController],
  providers: [
    CalendarService,
    FakeCalendarProvider,
    GoogleCalendarProvider,
    {
      provide: CALENDAR_PROVIDER,
      inject: [ConfigService, FakeCalendarProvider, GoogleCalendarProvider],
      useFactory: (config, fake, google) => {
        const clientId = config.get('GOOGLE_CLIENT_ID')?.trim();
        if (!clientId || process.env.NODE_ENV === 'test') {
          return fake;
        }
        return google;
      },
    },
  ],
  exports: [CalendarService, CALENDAR_PROVIDER, FakeCalendarProvider],
})
export class CalendarModule {}
