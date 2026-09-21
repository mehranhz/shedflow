import { Injectable, NotFoundException } from '@nestjs/common';
import {
  Page,
  PageRequest,
} from '../common/persistence';
import {
  CustomerEntity,
  UpdateCustomerData,
  UpsertCustomerInput,
} from './customer';
import { CustomerRepository } from './customer.repository';

@Injectable()
export class CustomersService {
  constructor(private readonly customers: CustomerRepository) {}

  list(
    organizationId: string,
    request: PageRequest<CustomerEntity> = {},
  ): Promise<Page<CustomerEntity>> {
    return this.customers.listInOrganization(organizationId, request);
  }

  async get(organizationId: string, id: string): Promise<CustomerEntity> {
    const customer = await this.customers.findInOrganization(
      organizationId,
      id,
    );
    if (!customer) {
      throw new NotFoundException('Not found');
    }
    return customer;
  }

  upsert(
    organizationId: string,
    input: UpsertCustomerInput,
  ): Promise<CustomerEntity> {
    return this.customers.upsert(organizationId, input);
  }

  async update(
    organizationId: string,
    id: string,
    data: UpdateCustomerData,
  ): Promise<CustomerEntity> {
    await this.get(organizationId, id);
    return this.customers.updateInOrganization(organizationId, id, data);
  }
}
