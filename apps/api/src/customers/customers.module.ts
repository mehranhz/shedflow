import { Module, forwardRef } from '@nestjs/common';
import { MembershipsModule } from '../memberships/memberships.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { CustomerRepository } from './customer.repository';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { PrismaCustomerRepository } from './prisma-customer.repository';

@Module({
  imports: [MembershipsModule, forwardRef(() => OrganizationsModule)],
  controllers: [CustomersController],
  providers: [
    CustomersService,
    { provide: CustomerRepository, useClass: PrismaCustomerRepository },
  ],
  exports: [CustomersService, CustomerRepository],
})
export class CustomersModule {}
