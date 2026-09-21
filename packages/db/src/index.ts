import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

export {
  BookingSource,
  BookingStatus,
  DomainEventStatus,
  LocationType,
  MembershipStatus,
  PlatformPlan,
  Prisma,
  PrismaClient,
  Role,
  UserTokenType,
} from './generated/prisma/client.js';
export type {
  AuditLog,
  AvailabilityRule,
  Booking,
  Customer,
  DateOverride,
  DomainEvent,
  EventType,
  IdempotencyKey,
  Invitation,
  Membership,
  Organization,
  RefreshToken,
  Schedule,
  SignedActionToken,
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
