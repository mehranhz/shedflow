import { Module } from '@nestjs/common';
import { BillingCustomerClient } from './billing-customer.client';
import { CustomerJwtGuard } from './customer-jwt.guard';
import { CustomerPaymentsController } from './customer-payments.controller';
import { CustomerPaymentsService } from './customer-payments.service';
import { LinkedCustomersService } from './linked-customers.service';

@Module({
  controllers: [CustomerPaymentsController],
  providers: [
    CustomerPaymentsService,
    BillingCustomerClient,
    LinkedCustomersService,
    CustomerJwtGuard,
  ],
  exports: [LinkedCustomersService, CustomerPaymentsService],
})
export class CustomerPaymentsModule {}
