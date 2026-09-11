import { Repository } from '../common/persistence';
import {
  CreateOrganizationData,
  Organization,
  UpdateOrganizationData,
} from './organization';

export abstract class OrganizationRepository extends Repository<
  Organization,
  CreateOrganizationData,
  UpdateOrganizationData
> {
  abstract findBySlug(slug: string): Promise<Organization | null>;

  abstract findActiveById(id: string): Promise<Organization | null>;
}
