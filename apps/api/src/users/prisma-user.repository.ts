import { Injectable } from '@nestjs/common';
import { Prisma, type User as UserRecord } from '@shedflow/db';
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
      name: record.name,
      timezone: record.timezone,
      locale: record.locale,
      emailVerifiedAt: record.emailVerifiedAt,
      deletedAt: record.deletedAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  findById(id: string): Promise<User | null> {
    return this.findOneWhere({ id, deletedAt: null });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.findOneWhere({ email, deletedAt: null });
  }
}
