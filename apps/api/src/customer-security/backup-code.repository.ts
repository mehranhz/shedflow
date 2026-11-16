import { Repository } from '../common/persistence';
import {
  BackupCode,
  CreateBackupCodeData,
  UpdateBackupCodeData,
} from './backup-code';

export abstract class BackupCodeRepository extends Repository<
  BackupCode,
  CreateBackupCodeData,
  UpdateBackupCodeData
> {
  abstract replaceForUser(userId: string, codeHashes: string[]): Promise<void>;

  abstract consume(
    userId: string,
    codeHash: string,
    usedAt: Date,
  ): Promise<boolean>;

  abstract countUnused(userId: string): Promise<number>;

  abstract deleteForUser(userId: string): Promise<void>;
}
