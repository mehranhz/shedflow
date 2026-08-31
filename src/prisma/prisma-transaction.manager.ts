import { Injectable } from '@nestjs/common';
import { TransactionManager } from '../common/persistence';
import { PrismaService } from './prisma.service';

@Injectable()
export class PrismaTransactionManager extends TransactionManager {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    return this.prisma.runInTransaction(work);
  }
}
