import { Global, Module } from '@nestjs/common';
import { TransactionManager } from '../common/persistence';
import { PrismaTransactionManager } from './prisma-transaction.manager';
import { PrismaService } from './prisma.service';

// Global because every feature module's repository needs the same connection
// pool; the alternative is importing this module in each of them.
@Global()
@Module({
  providers: [
    PrismaService,
    { provide: TransactionManager, useClass: PrismaTransactionManager },
  ],
  exports: [PrismaService, TransactionManager],
})
export class PrismaModule {}
