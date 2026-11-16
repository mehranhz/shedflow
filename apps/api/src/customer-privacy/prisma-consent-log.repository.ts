import { Injectable } from '@nestjs/common';
import { Prisma, type ConsentLog as ConsentLogRow } from '@shedflow/db';
import {
  PrismaModelDelegate,
  PrismaRepository,
} from '../prisma/prisma.repository';
import { PrismaService } from '../prisma/prisma.service';
import {
  ConsentLog,
  CreateConsentLogData,
  UpdateConsentLogData,
} from './consent-log';
import { ConsentLogRepository } from './consent-log.repository';

@Injectable()
export class PrismaConsentLogRepository
  extends PrismaRepository<
    ConsentLogRow,
    ConsentLog,
    CreateConsentLogData,
    UpdateConsentLogData
  >
  implements ConsentLogRepository
{
  constructor(prisma: PrismaService) {
    super(prisma, 'ConsentLog');
  }

  protected delegate(
    client: Prisma.TransactionClient,
  ): PrismaModelDelegate<ConsentLogRow> {
    return client.consentLog;
  }

  protected toEntity(record: ConsentLogRow): ConsentLog {
    return {
      id: record.id,
      userId: record.userId,
      organizationId: record.organizationId,
      purpose: record.purpose,
      granted: record.granted,
      consentedAt: record.consentedAt,
      ip: record.ip,
      userAgent: record.userAgent,
      source: record.source,
      createdAt: record.createdAt,
    };
  }

  listForUser(userId: string): Promise<ConsentLog[]> {
    return this.run(async () => {
      const records = await this.model.findMany({
        where: { userId },
        orderBy: [{ consentedAt: 'desc' }, { createdAt: 'desc' }],
      });
      return records.map((record) => this.toEntity(record));
    });
  }

  update(_id: string, _data: UpdateConsentLogData): Promise<ConsentLog> {
    return Promise.reject(new Error('Consent log is append-only'));
  }

  delete(_id: string): Promise<void> {
    return Promise.reject(new Error('Consent log is append-only'));
  }
}
