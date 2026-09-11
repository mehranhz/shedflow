import { Repository } from '../common/persistence';
import { AuditLog, CreateAuditLogData, UpdateAuditLogData } from './audit-log';

export abstract class AuditLogRepository extends Repository<
  AuditLog,
  CreateAuditLogData,
  UpdateAuditLogData
> {
  abstract findInOrganization(
    organizationId: string,
    id: string,
  ): Promise<AuditLog | null>;

  abstract listByOrganization(organizationId: string): Promise<AuditLog[]>;
}
