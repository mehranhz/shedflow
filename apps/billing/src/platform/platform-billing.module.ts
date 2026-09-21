import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { ApiOrganizationsClient } from './api-organizations.client';
import { PlatformBillingController } from './platform-billing.controller';
import { PlatformBillingService } from './platform-billing.service';

@Module({
  imports: [PaymentsModule],
  controllers: [PlatformBillingController],
  providers: [PlatformBillingService, ApiOrganizationsClient],
  exports: [PlatformBillingService],
})
export class PlatformBillingModule {}
