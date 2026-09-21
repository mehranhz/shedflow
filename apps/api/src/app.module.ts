import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { AvailabilityModule } from './availability/availability.module';
import { BookingsModule } from './bookings/bookings.module';
import { ClockModule } from './common/clock/clock.module';
import { IdempotencyModule } from './common/idempotency/idempotency.module';
import { RequestContextModule } from './common/tenancy/request-context.module';
import { validateEnv } from './config/env';
import { CustomersModule } from './customers/customers.module';
import { DeveloperModule } from './developer/developer.module';
import { DomainEventsModule } from './domain-events/domain-events.module';
import { CalendarModule } from './calendar/calendar.module';
import { EventTypesModule } from './event-types/event-types.module';
import { FallbackModule } from './fallback/fallback.module';
import { FlagsModule } from './flags/flags.module';
import { HealthController } from './health/health.controller';
import { MeModule } from './me/me.module';
import { ObservabilityModule } from './observability/observability.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { PlatformModule } from './platform/platform.module';
import { PrismaModule } from './prisma/prisma.module';
import { SchedulesModule } from './schedules/schedules.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
      validate: validateEnv,
    }),
    ObservabilityModule,
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }],
    }),
    ClockModule,
    RequestContextModule,
    PrismaModule,
    DomainEventsModule,
    AuditModule,
    IdempotencyModule,
    UsersModule,
    AuthModule,
    OrganizationsModule,
    SchedulesModule,
    EventTypesModule,
    AvailabilityModule,
    CustomersModule,
    BookingsModule,
    DeveloperModule,
    FlagsModule,
    PlatformModule,
    CalendarModule,
    MeModule,
    FallbackModule,
  ],
  controllers: [AppController, HealthController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
