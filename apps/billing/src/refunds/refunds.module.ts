import { Module } from '@nestjs/common';
import { CheckoutModule } from '../checkout/checkout.module';
import { ConnectModule } from '../connect/connect.module';
import { PaymentsModule } from '../payments/payments.module';
import { PrismaRefundRepository } from './prisma-refund.repository';
import { RefundRepository } from './refund.repository';
import { RefundsController } from './refunds.controller';
import { RefundsService } from './refunds.service';

@Module({
  imports: [PaymentsModule, ConnectModule, CheckoutModule],
  controllers: [RefundsController],
  providers: [
    RefundsService,
    { provide: RefundRepository, useClass: PrismaRefundRepository },
  ],
  exports: [RefundsService],
})
export class RefundsModule {}
