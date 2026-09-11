import { Repository } from '../common/persistence';
import {
  CreateInvitationData,
  Invitation,
  UpdateInvitationData,
} from './invitation';

/**
 * Tenant-owned: lookups go through {@link findInOrganization}, never a bare id.
 */
export abstract class InvitationRepository extends Repository<
  Invitation,
  CreateInvitationData,
  UpdateInvitationData
> {
  abstract findInOrganization(
    organizationId: string,
    id: string,
  ): Promise<Invitation | null>;

  abstract findByTokenHash(tokenHash: string): Promise<Invitation | null>;

  abstract findPendingByEmail(
    organizationId: string,
    email: string,
  ): Promise<Invitation | null>;

  abstract deleteInOrganization(
    organizationId: string,
    id: string,
  ): Promise<void>;
}
