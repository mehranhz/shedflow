import { Injectable } from '@nestjs/common';
import { Prisma, type UserBackupCode as UserBackupCodeRow } from '@shedflow/db';
import {
  PrismaModelDelegate,
  PrismaRepository,
} from '../prisma/prisma.repository';
import { PrismaService } from '../prisma/prisma.service';
import {
  BackupCode,
  CreateBackupCodeData,
  UpdateBackupCodeData,
} from './backup-code';
import { BackupCodeRepository } from './backup-code.repository';

@Injectable()
export class PrismaBackupCodeRepository
  extends PrismaRepository<
    UserBackupCodeRow,
    BackupCode,
    CreateBackupCodeData,
    UpdateBackupCodeData
  >
  implements BackupCodeRepository
{
  constructor(private readonly db: PrismaService) {
    super(db, 'UserBackupCode');
  }

  protected delegate(
    client: Prisma.TransactionClient,
  ): PrismaModelDelegate<UserBackupCodeRow> {
    return client.userBackupCode;
  }

  protected toEntity(record: UserBackupCodeRow): BackupCode {
    return {
      id: record.id,
      userId: record.userId,
      codeHash: record.codeHash,
      usedAt: record.usedAt,
      createdAt: record.createdAt,
    };
  }

  async replaceForUser(userId: string, codeHashes: string[]): Promise<void> {
    await this.run(async () => {
      const client = this.db.activeClient();
      await client.userBackupCode.deleteMany({ where: { userId } });
      if (codeHashes.length === 0) {
        return;
      }
      await client.userBackupCode.createMany({
        data: codeHashes.map((codeHash) => ({ userId, codeHash })),
      });
    });
  }

  async consume(userId: string, codeHash: string, usedAt: Date): Promise<boolean> {
    return this.run(async () => {
      const client = this.db.activeClient();
      const row = await client.userBackupCode.findFirst({
        where: { userId, codeHash, usedAt: null },
      });
      if (!row) {
        return false;
      }
      const updated = await client.userBackupCode.updateMany({
        where: { id: row.id, usedAt: null },
        data: { usedAt },
      });
      return updated.count === 1;
    });
  }

  countUnused(userId: string): Promise<number> {
    return this.run(() =>
      this.db.activeClient().userBackupCode.count({
        where: { userId, usedAt: null },
      }),
    );
  }

  async deleteForUser(userId: string): Promise<void> {
    await this.run(async () => {
      await this.db.activeClient().userBackupCode.deleteMany({ where: { userId } });
    });
  }
}
