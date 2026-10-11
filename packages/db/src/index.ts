import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

export {
  BookingSource,
  BookingStatus,
  CalendarProvider,
  CreditReason,
  DomainEventStatus,
  FavoriteKind,
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
  SupportSenderType,
  UserTokenType,
  WaitlistStatus,
  WebhookDeliveryStatus,
  DsrRequestType,
  DsrRequestStatus,
} from './generated/prisma/client.js';
export type {
  ApiKey,
  AuditLog,
  AvailabilityRule,
  Booking,
  BookingReview,
  CalendarConnection,
  ConnectedCalendar,
  CreditBalance,
  CreditLedgerEntry,
  Customer,
  CustomerFavorite,
  DateOverride,
  Dependent,
  DomainEvent,
  DsrRequest,
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
  ReferralAttribution,
  ReferralCode,
  RefreshToken,
  Refund,
  Schedule,
  SignedActionToken,
  StripeCustomer,
  StripeEvent,
  Subscription,
  SupportMessage,
  SupportThread,
  User,
  UserNotification,
  UserToken,
  WaitlistEntry,
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
