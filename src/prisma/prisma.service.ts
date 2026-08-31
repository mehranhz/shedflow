import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Prisma, PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  // Carries the transaction client down the call stack so repositories join the
  // caller's transaction without it being threaded through every signature.
  private readonly transaction =
    new AsyncLocalStorage<Prisma.TransactionClient>();

  constructor(configService: ConfigService) {
    super({
      adapter: new PrismaPg({
        connectionString: configService.getOrThrow<string>('DATABASE_URL'),
      }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** The transaction client while inside {@link runInTransaction}, else the root client. */
  activeClient(): Prisma.TransactionClient {
    return this.transaction.getStore() ?? this;
  }

  runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    if (this.transaction.getStore()) {
      return work();
    }

    return this.$transaction((tx) => this.transaction.run(tx, work));
  }
}
