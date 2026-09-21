import { Module } from '@nestjs/common';
import { ConnectModule } from '../connect/connect.module';
import { PaymentsModule } from '../payments/payments.module';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { PriceRepository } from './price.repository';
import { PrismaPriceRepository } from './prisma-price.repository';
import { PrismaProductRepository } from './prisma-product.repository';
import { ProductRepository } from './product.repository';

@Module({
  imports: [PaymentsModule, ConnectModule],
  controllers: [CatalogController],
  providers: [
    CatalogService,
    {
      provide: ProductRepository,
      useClass: PrismaProductRepository,
    },
    {
      provide: PriceRepository,
      useClass: PrismaPriceRepository,
    },
  ],
  exports: [CatalogService, ProductRepository, PriceRepository],
})
export class CatalogModule {}
