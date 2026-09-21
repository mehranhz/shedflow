import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CalendarModule } from './calendar/calendar.module';
import { validateEnv } from './config/env';
import { HealthController } from './health/health.controller';
import { JobsModule } from './jobs/jobs.module';
import { ObservabilityModule } from './observability/observability.module';
import { OutboxModule } from './outbox/outbox.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
      validate: validateEnv,
    }),
    ObservabilityModule,
    PrismaModule,
    QueueModule,
    CalendarModule,
    JobsModule,
    WebhooksModule,
    OutboxModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
