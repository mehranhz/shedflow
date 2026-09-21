import { Module } from '@nestjs/common';
import { CheckoutModule } from '../checkout/checkout.module';
import { ConnectModule } from '../connect/connect.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { MembershipsModule } from '../memberships/memberships.module';
import { PaymentsModule } from '../payments/payments.module';
import { RefundsModule } from '../refunds/refunds.module';
import { StripeEventsModule } from '../stripe-events/stripe-events.module';
import { StripeWebhooksController } from './stripe-webhooks.controller';
import { StripeWebhooksService } from './stripe-webhooks.service';

@Module({
  imports: [
    PaymentsModule,
    StripeEventsModule,
    ConnectModule,
    CheckoutModule,
    MembershipsModule,
    InvoicesModule,
    RefundsModule,
  ],
  controllers: [StripeWebhooksController],
  providers: [StripeWebhooksService],
})
export class WebhooksModule {}
