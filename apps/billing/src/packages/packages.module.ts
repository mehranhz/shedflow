import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { CheckoutModule } from '../checkout/checkout.module';
import { ConnectModule } from '../connect/connect.module';
import { MembershipsModule } from '../memberships/memberships.module';
import { PaymentsModule } from '../payments/payments.module';
import { PackagesInternalController } from './packages-internal.controller';
import { PackagesService } from './packages.service';

@Module({
  imports: [
    ConnectModule,
    CatalogModule,
    MembershipsModule,
    PaymentsModule,
    CheckoutModule,
  ],
  controllers: [PackagesInternalController],
  providers: [PackagesService],
  exports: [PackagesService],
})
export class PackagesModule {}
