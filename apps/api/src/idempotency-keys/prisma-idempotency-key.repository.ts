import { Injectable } from '@nestjs/common';
import { Prisma, type IdempotencyKey as IdempotencyKeyRecord } from '@shedflow/db';
import {
  PrismaModelDelegate,
  PrismaRepository,
} from '../prisma/prisma.repository';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateIdempotencyKeyData,
  IdempotencyKey,
  UpdateIdempotencyKeyData,
} from './idempotency-key';
import { IdempotencyKeyRepository } from './idempotency-key.repository';

@Injectable()
export class PrismaIdempotencyKeyRepository
  extends PrismaRepository<
    IdempotencyKeyRecord,
    IdempotencyKey,
    CreateIdempotencyKeyData,
    UpdateIdempotencyKeyData
  >
  implements IdempotencyKeyRepository
{
  constructor(prisma: PrismaService) {
    super(prisma, 'IdempotencyKey');
  }

  protected delegate(
    client: Prisma.TransactionClient,
  ): PrismaModelDelegate<IdempotencyKeyRecord> {
    return client.idempotencyKey;
  }

  protected toCreateInput(data: CreateIdempotencyKeyData): object {
    return {
      scope: data.scope,
      key: data.key,
      requestHash: data.requestHash,
      responseStatus: data.responseStatus,
      responseBody: data.responseBody as Prisma.InputJsonValue,
      expiresAt: data.expiresAt,
    };
  }

  protected toUpdateInput(data: UpdateIdempotencyKeyData): object {
    return {
      ...(data.requestHash !== undefined ? { requestHash: data.requestHash } : {}),
      ...(data.responseStatus !== undefined
        ? { responseStatus: data.responseStatus }
        : {}),
      ...(data.responseBody !== undefined
        ? { responseBody: data.responseBody as Prisma.InputJsonValue }
        : {}),
      ...(data.expiresAt !== undefined ? { expiresAt: data.expiresAt } : {}),
    };
  }

  protected toEntity(record: IdempotencyKeyRecord): IdempotencyKey {
    return {
      id: record.id,
      scope: record.scope,
      key: record.key,
      requestHash: record.requestHash,
      responseStatus: record.responseStatus,
      responseBody: record.responseBody,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
    };
  }

  findByScopeAndKey(
    scope: string,
    key: string,
  ): Promise<IdempotencyKey | null> {
    return this.findOneWhere({ scope, key });
  }
}
