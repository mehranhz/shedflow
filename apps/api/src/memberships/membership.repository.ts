import { Repository } from '../common/persistence';
import {
  CreateMembershipData,
  Membership,
  UpdateMembershipData,
} from './membership';

/**
 * Tenant-owned: lookups go through {@link findInOrganization}, never a bare id.
 */
export abstract class MembershipRepository extends Repository<
  Membership,
  CreateMembershipData,
  UpdateMembershipData
> {
  abstract findInOrganization(
    organizationId: string,
    id: string,
  ): Promise<Membership | null>;

  abstract findByUserInOrganization(
    organizationId: string,
    userId: string,
  ): Promise<Membership | null>;

  abstract listByOrganization(organizationId: string): Promise<Membership[]>;

  abstract listByUserId(userId: string): Promise<Membership[]>;

  abstract updateInOrganization(
    organizationId: string,
    id: string,
    data: UpdateMembershipData,
  ): Promise<Membership>;

  abstract deleteInOrganization(
    organizationId: string,
    id: string,
  ): Promise<void>;
}
