import { Module } from '@nestjs/common';
import { CheckoutModule } from '../checkout/checkout.module';
import { MembershipsModule } from '../memberships/memberships.module';
import { InvoiceRepository } from './invoice.repository';
import { InvoicesService } from './invoices.service';
import { PrismaInvoiceRepository } from './prisma-invoice.repository';

@Module({
  imports: [CheckoutModule, MembershipsModule],
  providers: [
    InvoicesService,
    { provide: InvoiceRepository, useClass: PrismaInvoiceRepository },
  ],
  exports: [InvoicesService, InvoiceRepository],
})
export class InvoicesModule {}
