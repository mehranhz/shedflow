import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

export {
  BookingSource,
  BookingStatus,
  CalendarProvider,
  CreditReason,
  DomainEventStatus,
  LocationType,
  MembershipStatus,
  NotificationChannel,
  NotificationStatus,
  PaymentStatus,
  PlatformPlan,
  Prisma,
  PrismaClient,
  ProductType,
  Role,
  SubscriptionStatus,
  UserTokenType,
  WebhookDeliveryStatus,
} from './generated/prisma/client.js';
export type {
  ApiKey,
  AuditLog,
  AvailabilityRule,
  Booking,
  CalendarConnection,
  ConnectedCalendar,
  CreditBalance,
  CreditLedgerEntry,
  Customer,
  DateOverride,
  DomainEvent,
  EventType,
  ExternalBusyBlock,
  IdempotencyKey,
  Invitation,
  Invoice,
  Membership,
  NotificationLog,
  Organization,
  Payment,
  PlatformAccount,
  Price,
  Product,
  RefreshToken,
  Refund,
  Schedule,
  SignedActionToken,
  StripeCustomer,
  StripeEvent,
  Subscription,
  User,
  UserToken,
  WebhookDelivery,
  WebhookEndpoint,
} from './generated/prisma/client.js';

export function createPrismaAdapter(connectionString: string): PrismaPg {
  return new PrismaPg({ connectionString });
}

export function createPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({
    adapter: createPrismaAdapter(connectionString),
  });
}
