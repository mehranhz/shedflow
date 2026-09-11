import { Injectable } from '@nestjs/common';
import { Prisma, type AuditLog as AuditLogRecord } from '@shedflow/db';
import {
  PrismaModelDelegate,
  PrismaRepository,
} from '../prisma/prisma.repository';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLog, CreateAuditLogData, UpdateAuditLogData } from './audit-log';
import { AuditLogRepository } from './audit-log.repository';

@Injectable()
export class PrismaAuditLogRepository
  extends PrismaRepository<
    AuditLogRecord,
    AuditLog,
    CreateAuditLogData,
    UpdateAuditLogData
  >
  implements AuditLogRepository
{
  constructor(prisma: PrismaService) {
    super(prisma, 'AuditLog');
  }

  protected delegate(
    client: Prisma.TransactionClient,
  ): PrismaModelDelegate<AuditLogRecord> {
    return client.auditLog;
  }

  protected toEntity(record: AuditLogRecord): AuditLog {
    return {
      id: record.id,
      organizationId: record.organizationId,
      actorUserId: record.actorUserId,
      actorType: record.actorType,
      action: record.action,
      resourceType: record.resourceType,
      resourceId: record.resourceId,
      ip: record.ip,
      userAgent: record.userAgent,
      metadata: asJsonObject(record.metadata),
      createdAt: record.createdAt,
    };
  }

  findById(_id: string): Promise<AuditLog | null> {
    return Promise.reject(new Error('AuditLog lookups require organizationId'));
  }

  findInOrganization(
    organizationId: string,
    id: string,
  ): Promise<AuditLog | null> {
    return this.findOneWhere({ id, organizationId });
  }

  listByOrganization(organizationId: string): Promise<AuditLog[]> {
    return this.findManyWhere({ organizationId });
  }
}

function asJsonObject(value: Prisma.JsonValue): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}
