import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AuditLog, CreateAuditLogData } from './audit-log';
import { AuditLogRepository } from './audit-log.repository';

export function hashEmail(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

@Injectable()
export class AuditService {
  constructor(private readonly logs: AuditLogRepository) {}

  record(input: CreateAuditLogData): Promise<AuditLog> {
    return this.logs.create({
      organizationId: input.organizationId ?? null,
      actorUserId: input.actorUserId ?? null,
      actorType: input.actorType,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      metadata: input.metadata ?? {},
    });
  }
}
