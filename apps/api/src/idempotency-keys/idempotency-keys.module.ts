import { Global, Module } from '@nestjs/common';
import { IdempotencyKeyRepository } from './idempotency-key.repository';
import { PrismaIdempotencyKeyRepository } from './prisma-idempotency-key.repository';

@Global()
@Module({
  providers: [
    {
      provide: IdempotencyKeyRepository,
      useClass: PrismaIdempotencyKeyRepository,
    },
  ],
  exports: [IdempotencyKeyRepository],
})
export class IdempotencyKeysModule {}
