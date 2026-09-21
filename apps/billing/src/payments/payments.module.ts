import { Module } from '@nestjs/common';
import { PaymentGateway } from './payment-gateway';
import { StripePaymentGateway } from './stripe-payment-gateway';

@Module({
  providers: [
    StripePaymentGateway,
    { provide: PaymentGateway, useExisting: StripePaymentGateway },
  ],
  exports: [PaymentGateway],
})
export class PaymentsModule {}
