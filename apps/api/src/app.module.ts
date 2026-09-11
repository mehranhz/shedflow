import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { ClockModule } from './common/clock/clock.module';
import { IdempotencyModule } from './common/idempotency/idempotency.module';
import { RequestContextModule } from './common/tenancy/request-context.module';
import { validateEnv } from './config/env';
import { DomainEventsModule } from './domain-events/domain-events.module';
import { FallbackModule } from './fallback/fallback.module';
import { HealthController } from './health/health.controller';
import { OrganizationsModule } from './organizations/organizations.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
      validate: validateEnv,
    }),
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
    FallbackModule,
  ],
  controllers: [AppController, HealthController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
