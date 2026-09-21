import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { CheckoutModule } from './checkout/checkout.module';
import { ConnectModule } from './connect/connect.module';
import { CreditsModule } from './credits/credits.module';
import { validateEnv } from './config/env';
import { HealthController } from './health/health.controller';
import { InternalModule } from './internal/internal.module';
import { InvoicesModule } from './invoices/invoices.module';
import { MembershipsModule } from './memberships/memberships.module';
import { MetricsController } from './metrics/metrics.controller';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './prisma/prisma.module';
import { RefundsModule } from './refunds/refunds.module';
import { StripeEventsModule } from './stripe-events/stripe-events.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
      validate: validateEnv,
    }),
    PrismaModule,
    AuthModule,
    PaymentsModule,
    StripeEventsModule,
    ConnectModule,
    CatalogModule,
    CheckoutModule,
    CreditsModule,
    MembershipsModule,
    RefundsModule,
    InvoicesModule,
    WebhooksModule,
    InternalModule,
  ],
  controllers: [HealthController, MetricsController],
})
export class AppModule {}
