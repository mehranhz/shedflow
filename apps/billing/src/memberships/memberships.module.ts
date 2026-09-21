import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { CheckoutModule } from '../checkout/checkout.module';
import { ConnectModule } from '../connect/connect.module';
import { CreditsModule } from '../credits/credits.module';
import { PaymentsModule } from '../payments/payments.module';
import { MembershipsInternalController } from './memberships-internal.controller';
import { MembershipsService } from './memberships.service';
import { PrismaStripeCustomerRepository } from './prisma-stripe-customer.repository';
import { PrismaSubscriptionRepository } from './prisma-subscription.repository';
import { StripeCustomerRepository } from './stripe-customer.repository';
import { SubscriptionRepository } from './subscription.repository';

@Module({
  imports: [
    PaymentsModule,
    ConnectModule,
    CatalogModule,
    CreditsModule,
    CheckoutModule,
  ],
  controllers: [MembershipsInternalController],
  providers: [
    MembershipsService,
    { provide: SubscriptionRepository, useClass: PrismaSubscriptionRepository },
    {
      provide: StripeCustomerRepository,
      useClass: PrismaStripeCustomerRepository,
    },
  ],
  exports: [
    MembershipsService,
    SubscriptionRepository,
    StripeCustomerRepository,
  ],
})
export class MembershipsModule {}
