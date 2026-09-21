import { Page, PageRequest, Repository } from '../common/persistence';
import {
  CreateCustomerData,
  CustomerEntity,
  UpdateCustomerData,
  UpsertCustomerInput,
} from './customer';

export abstract class CustomerRepository extends Repository<
  CustomerEntity,
  CreateCustomerData,
  UpdateCustomerData
> {
  abstract findInOrganization(
    organizationId: string,
    id: string,
  ): Promise<CustomerEntity | null>;

  abstract findByEmail(
    organizationId: string,
    email: string,
  ): Promise<CustomerEntity | null>;

  abstract listInOrganization(
    organizationId: string,
    request?: PageRequest<CustomerEntity>,
  ): Promise<Page<CustomerEntity>>;

  abstract upsert(
    organizationId: string,
    input: UpsertCustomerInput,
  ): Promise<CustomerEntity>;

  abstract updateInOrganization(
    organizationId: string,
    id: string,
    data: UpdateCustomerData,
  ): Promise<CustomerEntity>;
}
