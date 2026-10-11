import { Module } from '@nestjs/common';
import { ConnectModule } from '../connect/connect.module';
import { MembershipsModule } from '../memberships/memberships.module';
import { PaymentsModule } from '../payments/payments.module';
import { CustomerPortalInternalController } from './customer-portal-internal.controller';
import { CustomerPortalService } from './customer-portal.service';

@Module({
  imports: [ConnectModule, MembershipsModule, PaymentsModule],
  controllers: [CustomerPortalInternalController],
  providers: [CustomerPortalService],
  exports: [CustomerPortalService],
})
export class CustomerPortalModule {}
