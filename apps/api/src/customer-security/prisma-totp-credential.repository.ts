import { Injectable } from '@nestjs/common';
import { Prisma, type UserTotp as UserTotpRow } from '@shedflow/db';
import {
  PrismaModelDelegate,
  PrismaRepository,
} from '../prisma/prisma.repository';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateTotpCredentialData,
  TotpCredential,
  UpdateTotpCredentialData,
} from './totp-credential';
import { TotpCredentialRepository } from './totp-credential.repository';

@Injectable()
export class PrismaTotpCredentialRepository
  extends PrismaRepository<
    UserTotpRow,
    TotpCredential,
    CreateTotpCredentialData,
    UpdateTotpCredentialData
  >
  implements TotpCredentialRepository
{
  constructor(prisma: PrismaService) {
    super(prisma, 'UserTotp');
  }

  protected delegate(
    client: Prisma.TransactionClient,
  ): PrismaModelDelegate<UserTotpRow> {
    return client.userTotp;
  }

  protected toEntity(record: UserTotpRow): TotpCredential {
    return {
      id: record.id,
      userId: record.userId,
      pendingSecretCiphertext: record.pendingSecretCiphertext,
      secretCiphertext: record.secretCiphertext,
      enabledAt: record.enabledAt,
      failedAttempts: record.failedAttempts,
      windowStartedAt: record.windowStartedAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  findByUserId(userId: string): Promise<TotpCredential | null> {
    return this.findOneWhere({ userId });
  }
}
