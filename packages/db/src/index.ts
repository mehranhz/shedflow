import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

export {
  DomainEventStatus,
  MembershipStatus,
  PlatformPlan,
  Prisma,
  PrismaClient,
  Role,
  UserTokenType,
} from './generated/prisma/client.js';
export type {
  AuditLog,
  DomainEvent,
  IdempotencyKey,
  Invitation,
  Membership,
  Organization,
  RefreshToken,
  User,
  UserToken,
} from './generated/prisma/client.js';

export function createPrismaAdapter(connectionString: string): PrismaPg {
  return new PrismaPg({ connectionString });
}

export function createPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({
    adapter: createPrismaAdapter(connectionString),
  });
}
