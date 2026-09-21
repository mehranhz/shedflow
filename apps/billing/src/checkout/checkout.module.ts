import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { ConnectModule } from '../connect/connect.module';
import { PaymentsModule } from '../payments/payments.module';
import { ApiBookingsClient } from './api-bookings.client';
import { BillingOutbox } from './billing-outbox';
import { CheckoutInternalController } from './checkout-internal.controller';
import { CheckoutService } from './checkout.service';
import { PaymentRepository } from './payment.repository';
import { PrismaPaymentRepository } from './prisma-payment.repository';

@Module({
  imports: [PaymentsModule, ConnectModule, CatalogModule],
  controllers: [CheckoutInternalController],
  providers: [
    CheckoutService,
    BillingOutbox,
    ApiBookingsClient,
    { provide: PaymentRepository, useClass: PrismaPaymentRepository },
  ],
  exports: [CheckoutService, PaymentRepository, BillingOutbox],
})
export class CheckoutModule {}
