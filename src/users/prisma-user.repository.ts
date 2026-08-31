import { Injectable } from '@nestjs/common';
import { Prisma, type User as UserRecord } from '../generated/prisma/client';
import {
  PrismaModelDelegate,
  PrismaRepository,
} from '../prisma/prisma.repository';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserData, UpdateUserData, User } from './user';
import { UserRepository } from './user.repository';

@Injectable()
export class PrismaUserRepository
  extends PrismaRepository<UserRecord, User, CreateUserData, UpdateUserData>
  implements UserRepository
{
  constructor(prisma: PrismaService) {
    super(prisma, 'User');
  }

  protected delegate(
    client: Prisma.TransactionClient,
  ): PrismaModelDelegate<UserRecord> {
    return client.user;
  }

  protected toEntity(record: UserRecord): User {
    return {
      id: record.id,
      email: record.email,
      passwordHash: record.passwordHash,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  findByEmail(email: string): Promise<User | null> {
    return this.findOneWhere({ email });
  }
}
