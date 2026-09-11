# MVP 02 — Data model, indexes, migrations

**Owner of this document:** `packages/db`.

**Conventions (non-negotiable)**

- UUID v4 primary keys (`@id @default(uuid()) @db.Uuid`).
- Snake_case columns via `@map` / `@@map`. camelCase in TypeScript entities.
- All timestamps `Timestamptz(3)`. Store **UTC**. Never `timestamp` without time zone.
- Money: `Int` minor units + `Char(3)` ISO 4217. Never `Float`/`Decimal` for card amounts in application code (Stripe uses integers; we match).
- Tenant-owned tables always have `organization_id` and a leading index on it.
- Soft-delete only where GDPR / recovery needs it (`organizations.deleted_at`, `users.deleted_at`). Bookings are immutable history — cancel, do not delete.
- Cross-service IDs (`price_id`, `payment_id`, `subscription_id`) are UUID columns **without FK**. Same-service relations use real FKs.
- Prisma cannot express exclusion constraints or generated range columns. Those live in a follow-up SQL migration (`*_booking_exclusion`) applied after the Prisma migration. Never recreate them with `prisma db pull`.

---

## 1. Entity-relationship overview

```
User ──< Membership >── Organization
 User ──< RefreshToken, UserToken
 Organization ──< Invitation, Schedule, EventType, Customer, Booking, ApiKey, …
 Schedule ──< AvailabilityRule, DateOverride
 EventType ──> Schedule, User (host)
 Booking ──> EventType, User (host), Customer
 CalendarConnection ──< ConnectedCalendar ──< ExternalBusyBlock
 Organization ── PlatformAccount (billing)
 Organization ──< Product ──< Price
 Customer ── StripeCustomer, Subscription, CreditLedgerEntry, Payment
```

---

## 2. Complete Prisma schema (application models)

This is the target schema after Wave 0–4. Apply it as **incremental migrations**, not one dump: each task that introduces models also adds a Prisma migration. The block below is the source of truth for column names, enums, uniques and indexes.

```prisma
generator client {
  provider     = "prisma-client"
  output       = "../src/generated/prisma"
  moduleFormat = "cjs"
}

datasource db {
  provider = "postgresql"
}

// ---------------------------------------------------------------------------
// Identity (apps/api)
// ---------------------------------------------------------------------------

enum Role {
  OWNER
  ADMIN
  MEMBER
}

enum MembershipStatus {
  ACTIVE
  DISABLED
}

enum UserTokenType {
  EMAIL_VERIFY
  PASSWORD_RESET
}

enum PlatformPlan {
  FREE
  PRO
}

model User {
  id              String    @id @default(uuid()) @db.Uuid
  email           String    @unique
  passwordHash    String    @map("password_hash")
  name            String?
  timezone        String    @default("UTC") // IANA
  locale          String    @default("en")
  emailVerifiedAt DateTime? @map("email_verified_at") @db.Timestamptz(3)
  deletedAt       DateTime? @map("deleted_at") @db.Timestamptz(3)
  createdAt       DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt       DateTime  @updatedAt @map("updated_at") @db.Timestamptz(3)

  refreshTokens RefreshToken[]
  tokens        UserToken[]
  memberships   Membership[]
  hostedSchedules Schedule[]     @relation("ScheduleHost")
  hostedEventTypes EventType[]   @relation("EventTypeHost")
  hostedBookings Booking[]       @relation("BookingHost")
  calendarConnections CalendarConnection[]
  auditLogs     AuditLog[]

  @@map("users")
}

model RefreshToken {
  id           String    @id @default(uuid()) @db.Uuid
  userId       String    @map("user_id") @db.Uuid
  tokenHash    String    @map("token_hash")
  expiresAt    DateTime  @map("expires_at") @db.Timestamptz(3)
  revokedAt    DateTime? @map("revoked_at") @db.Timestamptz(3)
  replacedById String?   @map("replaced_by_id") @db.Uuid
  userAgent    String?   @map("user_agent")
  ip           String?
  createdAt    DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([tokenHash])
  @@map("refresh_tokens")
}

model UserToken {
  id        String        @id @default(uuid()) @db.Uuid
  userId    String        @map("user_id") @db.Uuid
  type      UserTokenType
  tokenHash String        @map("token_hash")
  expiresAt DateTime      @map("expires_at") @db.Timestamptz(3)
  usedAt    DateTime?     @map("used_at") @db.Timestamptz(3)
  createdAt DateTime      @default(now()) @map("created_at") @db.Timestamptz(3)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([tokenHash])
  @@index([userId, type])
  @@map("user_tokens")
}

model Organization {
  id                         String       @id @default(uuid()) @db.Uuid
  name                       String
  slug                       String       @unique
  timezone                   String       @default("UTC")
  locale                     String       @default("en")
  currency                   String       @default("USD") @db.Char(3)
  logoUrl                    String?      @map("logo_url")
  brandColor                 String?      @map("brand_color") // #RRGGBB
  platformPlan               PlatformPlan @default(FREE) @map("platform_plan")
  platformStripeCustomerId   String?      @map("platform_stripe_customer_id")
  platformStripeSubscriptionId String?    @map("platform_stripe_subscription_id")
  settings                   Json         @default("{}")
  deletedAt                  DateTime?    @map("deleted_at") @db.Timestamptz(3)
  createdAt                  DateTime     @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt                  DateTime     @updatedAt @map("updated_at") @db.Timestamptz(3)

  memberships Membership[]
  invitations Invitation[]
  schedules   Schedule[]
  eventTypes  EventType[]
  customers   Customer[]
  bookings    Booking[]
  calendarConnections CalendarConnection[]
  apiKeys     ApiKey[]
  webhookEndpoints WebhookEndpoint[]
  auditLogs   AuditLog[]
  products    Product[]
  platformAccount PlatformAccount?

  @@map("organizations")
}

model Membership {
  id             String           @id @default(uuid()) @db.Uuid
  organizationId String           @map("organization_id") @db.Uuid
  userId         String           @map("user_id") @db.Uuid
  role           Role
  status         MembershipStatus @default(ACTIVE)
  createdAt      DateTime         @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt      DateTime         @updatedAt @map("updated_at") @db.Timestamptz(3)

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([organizationId, userId])
  @@index([userId])
  @@map("memberships")
}

model Invitation {
  id             String    @id @default(uuid()) @db.Uuid
  organizationId String    @map("organization_id") @db.Uuid
  email          String
  role           Role
  tokenHash      String    @unique @map("token_hash")
  invitedById    String    @map("invited_by_id") @db.Uuid
  expiresAt      DateTime  @map("expires_at") @db.Timestamptz(3)
  acceptedAt     DateTime? @map("accepted_at") @db.Timestamptz(3)
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([organizationId, email])
  @@map("invitations")
}

// ---------------------------------------------------------------------------
// Scheduling (apps/api)
// ---------------------------------------------------------------------------

enum LocationType {
  GOOGLE_MEET
  LINK
  PHONE
  IN_PERSON
  CUSTOM
}

enum BookingStatus {
  PENDING_PAYMENT
  PENDING_CONFIRMATION
  CONFIRMED
  CANCELLED
  RESCHEDULED
  EXPIRED
  NO_SHOW
}

enum BookingSource {
  HOSTED
  EMBED
  API
  DASHBOARD
}

model Schedule {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @map("organization_id") @db.Uuid
  hostUserId     String   @map("host_user_id") @db.Uuid
  name           String
  timezone       String // IANA, source of truth for rules
  isDefault      Boolean  @default(false) @map("is_default")
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt      DateTime @updatedAt @map("updated_at") @db.Timestamptz(3)

  organization Organization      @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  host         User              @relation("ScheduleHost", fields: [hostUserId], references: [id])
  rules        AvailabilityRule[]
  overrides    DateOverride[]
  eventTypes   EventType[]

  @@index([organizationId, hostUserId])
  @@map("schedules")
}

model AvailabilityRule {
  id          String @id @default(uuid()) @db.Uuid
  scheduleId  String @map("schedule_id") @db.Uuid
  /// 0 = Sunday … 6 = Saturday (ISO is 1–7; we use JS getUTCDay() convention).
  dayOfWeek   Int    @map("day_of_week")
  /// Minutes from local midnight in the schedule timezone. 0–1440.
  startMinute Int    @map("start_minute")
  endMinute   Int    @map("end_minute")

  schedule Schedule @relation(fields: [scheduleId], references: [id], onDelete: Cascade)

  @@index([scheduleId, dayOfWeek])
  @@map("availability_rules")
}

model DateOverride {
  id            String   @id @default(uuid()) @db.Uuid
  scheduleId    String   @map("schedule_id") @db.Uuid
  /// Calendar date in the schedule timezone (DATE, not timestamptz).
  date          DateTime @db.Date
  isUnavailable Boolean  @default(false) @map("is_unavailable")
  startMinute   Int?     @map("start_minute")
  endMinute     Int?     @map("end_minute")

  schedule Schedule @relation(fields: [scheduleId], references: [id], onDelete: Cascade)

  @@unique([scheduleId, date])
  @@map("date_overrides")
}

model EventType {
  id                     String       @id @default(uuid()) @db.Uuid
  organizationId         String       @map("organization_id") @db.Uuid
  hostUserId             String       @map("host_user_id") @db.Uuid
  scheduleId             String       @map("schedule_id") @db.Uuid
  slug                   String
  title                  String
  description            String       @default("")
  durationMinutes        Int          @map("duration_minutes")
  locationType           LocationType @map("location_type")
  locationValue          String?      @map("location_value")
  bufferBeforeMinutes    Int          @default(0) @map("buffer_before_minutes")
  bufferAfterMinutes     Int          @default(0) @map("buffer_after_minutes")
  minNoticeMinutes       Int          @default(60) @map("min_notice_minutes")
  maxDaysAhead           Int          @default(60) @map("max_days_ahead")
  slotIntervalMinutes    Int          @default(0) @map("slot_interval_minutes") // 0 = duration
  dailyCap               Int?         @map("daily_cap")
  requiresConfirmation   Boolean      @default(false) @map("requires_confirmation")
  cancellationNoticeHours Int         @default(24) @map("cancellation_notice_hours")
  rescheduleNoticeHours  Int          @default(24) @map("reschedule_notice_hours")
  /// Billing-owned; no FK.
  priceId                String?      @map("price_id") @db.Uuid
  subscriptionProductId  String?      @map("subscription_product_id") @db.Uuid
  creditCost             Int          @default(0) @map("credit_cost")
  questions              Json         @default("[]")
  isActive               Boolean      @default(true) @map("is_active")
  isHidden               Boolean      @default(false) @map("is_hidden")
  createdAt              DateTime     @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt              DateTime     @updatedAt @map("updated_at") @db.Timestamptz(3)

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  host         User         @relation("EventTypeHost", fields: [hostUserId], references: [id])
  schedule     Schedule     @relation(fields: [scheduleId], references: [id])
  bookings     Booking[]

  @@unique([organizationId, slug])
  @@index([organizationId, hostUserId])
  @@map("event_types")
}

model Customer {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @map("organization_id") @db.Uuid
  email          String
  name           String
  phone          String?
  timezone       String?
  notes          String   @default("")
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt      DateTime @updatedAt @map("updated_at") @db.Timestamptz(3)

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  bookings     Booking[]

  @@unique([organizationId, email])
  @@map("customers")
}

model Booking {
  id                 String        @id @default(uuid()) @db.Uuid
  uid                String        @unique // public, unguessable (nanoid 21)
  organizationId     String        @map("organization_id") @db.Uuid
  eventTypeId        String        @map("event_type_id") @db.Uuid
  hostUserId         String        @map("host_user_id") @db.Uuid
  customerId         String        @map("customer_id") @db.Uuid
  startAt            DateTime      @map("start_at") @db.Timestamptz(3)
  endAt              DateTime      @map("end_at") @db.Timestamptz(3)
  bufferBeforeMinutes Int          @map("buffer_before_minutes")
  bufferAfterMinutes Int           @map("buffer_after_minutes")
  timezone           String // invitee IANA zone at booking time
  status             BookingStatus
  source             BookingSource
  locationType       LocationType  @map("location_type")
  locationValue      String?       @map("location_value")
  answers            Json          @default("{}")
  cancellationReason String?       @map("cancellation_reason")
  rescheduledFromId  String?       @map("rescheduled_from_id") @db.Uuid
  /// Billing-owned; no FK.
  paymentId          String?       @map("payment_id") @db.Uuid
  subscriptionId     String?       @map("subscription_id") @db.Uuid
  holdExpiresAt      DateTime?     @map("hold_expires_at") @db.Timestamptz(3)
  metadata           Json          @default("{}")
  createdAt          DateTime      @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt          DateTime      @updatedAt @map("updated_at") @db.Timestamptz(3)

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  eventType    EventType    @relation(fields: [eventTypeId], references: [id])
  host         User         @relation("BookingHost", fields: [hostUserId], references: [id])
  customer     Customer     @relation(fields: [customerId], references: [id])

  @@index([organizationId, startAt])
  @@index([hostUserId, startAt])
  @@index([eventTypeId, startAt])
  @@index([customerId])
  @@index([status, holdExpiresAt])
  @@map("bookings")
}

// ---------------------------------------------------------------------------
// Calendar (apps/api)
// ---------------------------------------------------------------------------

enum CalendarProvider {
  GOOGLE
  MICROSOFT
}

model CalendarConnection {
  id                 String           @id @default(uuid()) @db.Uuid
  organizationId     String           @map("organization_id") @db.Uuid
  userId             String           @map("user_id") @db.Uuid
  provider           CalendarProvider
  accountEmail       String           @map("account_email")
  accessTokenEnc     Bytes            @map("access_token_enc")
  refreshTokenEnc    Bytes            @map("refresh_token_enc")
  tokenExpiresAt     DateTime         @map("token_expires_at") @db.Timestamptz(3)
  scopes             String[]
  channelId          String?          @map("channel_id")
  resourceId         String?          @map("resource_id")
  channelExpiresAt   DateTime?        @map("channel_expires_at") @db.Timestamptz(3)
  syncToken          String?          @map("sync_token")
  lastSyncedAt       DateTime?        @map("last_synced_at") @db.Timestamptz(3)
  createdAt          DateTime         @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt          DateTime         @updatedAt @map("updated_at") @db.Timestamptz(3)

  organization Organization       @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  user         User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  calendars    ConnectedCalendar[]

  @@unique([userId, provider, accountEmail])
  @@index([organizationId])
  @@map("calendar_connections")
}

model ConnectedCalendar {
  id           String  @id @default(uuid()) @db.Uuid
  connectionId String  @map("connection_id") @db.Uuid
  externalId   String  @map("external_id")
  name         String
  isPrimary    Boolean @default(false) @map("is_primary")
  conflictCheck Boolean @default(true) @map("conflict_check")
  writeTarget  Boolean @default(false) @map("write_target")

  connection CalendarConnection @relation(fields: [connectionId], references: [id], onDelete: Cascade)
  busyBlocks ExternalBusyBlock[]

  @@unique([connectionId, externalId])
  @@map("connected_calendars")
}

model ExternalBusyBlock {
  id                  String   @id @default(uuid()) @db.Uuid
  connectedCalendarId String   @map("connected_calendar_id") @db.Uuid
  hostUserId          String   @map("host_user_id") @db.Uuid
  startAt             DateTime @map("start_at") @db.Timestamptz(3)
  endAt               DateTime @map("end_at") @db.Timestamptz(3)
  externalEventId     String   @map("external_event_id")
  etag                String?
  updatedAt           DateTime @updatedAt @map("updated_at") @db.Timestamptz(3)

  calendar ConnectedCalendar @relation(fields: [connectedCalendarId], references: [id], onDelete: Cascade)

  @@unique([connectedCalendarId, externalEventId])
  @@index([hostUserId, startAt, endAt])
  @@map("external_busy_blocks")
}

// ---------------------------------------------------------------------------
// Developer platform, events, ops (apps/api)
// ---------------------------------------------------------------------------

enum DomainEventStatus {
  PENDING
  PROCESSED
  FAILED
}

enum WebhookDeliveryStatus {
  PENDING
  SUCCESS
  FAILED
}

model ApiKey {
  id             String    @id @default(uuid()) @db.Uuid
  organizationId String    @map("organization_id") @db.Uuid
  name           String
  prefix         String // sf_live_xxxx shown in UI
  keyHash        String    @unique @map("key_hash")
  scopes         String[]
  lastUsedAt     DateTime? @map("last_used_at") @db.Timestamptz(3)
  expiresAt      DateTime? @map("expires_at") @db.Timestamptz(3)
  revokedAt      DateTime? @map("revoked_at") @db.Timestamptz(3)
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([organizationId])
  @@map("api_keys")
}

model WebhookEndpoint {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @map("organization_id") @db.Uuid
  url            String
  secretEnc      Bytes    @map("secret_enc")
  events         String[]
  isActive       Boolean  @default(true) @map("is_active")
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt      DateTime @updatedAt @map("updated_at") @db.Timestamptz(3)

  organization Organization     @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  deliveries   WebhookDelivery[]

  @@index([organizationId])
  @@map("webhook_endpoints")
}

model WebhookDelivery {
  id           String                 @id @default(uuid()) @db.Uuid
  endpointId   String                 @map("endpoint_id") @db.Uuid
  eventId      String                 @map("event_id") @db.Uuid
  status       WebhookDeliveryStatus  @default(PENDING)
  attempt      Int                    @default(0)
  nextRetryAt  DateTime?              @map("next_retry_at") @db.Timestamptz(3)
  lastStatus   Int?                   @map("last_status")
  lastError    String?                @map("last_error")
  createdAt    DateTime               @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt    DateTime               @updatedAt @map("updated_at") @db.Timestamptz(3)

  endpoint WebhookEndpoint @relation(fields: [endpointId], references: [id], onDelete: Cascade)

  @@index([status, nextRetryAt])
  @@index([endpointId, createdAt])
  @@map("webhook_deliveries")
}

model DomainEvent {
  id             String            @id @default(uuid()) @db.Uuid
  organizationId String?           @map("organization_id") @db.Uuid
  type           String
  payload        Json
  status         DomainEventStatus @default(PENDING)
  attempts       Int               @default(0)
  availableAt    DateTime          @default(now()) @map("available_at") @db.Timestamptz(3)
  processedAt    DateTime?         @map("processed_at") @db.Timestamptz(3)
  lastError      String?           @map("last_error")
  createdAt      DateTime          @default(now()) @map("created_at") @db.Timestamptz(3)

  @@index([status, availableAt])
  @@index([type, createdAt])
  @@map("domain_events")
}

model IdempotencyKey {
  id             String   @id @default(uuid()) @db.Uuid
  scope          String // org:{id} | user:{id} | public:{hash}
  key            String
  requestHash    String   @map("request_hash")
  responseStatus Int      @map("response_status")
  responseBody   Json     @map("response_body")
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  expiresAt      DateTime @map("expires_at") @db.Timestamptz(3)

  @@unique([scope, key])
  @@index([expiresAt])
  @@map("idempotency_keys")
}

model AuditLog {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String?  @map("organization_id") @db.Uuid
  actorUserId    String?  @map("actor_user_id") @db.Uuid
  actorType      String   @map("actor_type") // user | api_key | system | invitee
  action         String
  resourceType   String   @map("resource_type")
  resourceId     String?  @map("resource_id")
  ip             String?
  userAgent      String?  @map("user_agent")
  metadata       Json     @default("{}")
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(3)

  organization Organization? @relation(fields: [organizationId], references: [id])
  actor        User?         @relation(fields: [actorUserId], references: [id])

  @@index([organizationId, createdAt])
  @@index([resourceType, resourceId])
  @@map("audit_logs")
}

model SignedActionToken {
  id         String    @id @default(uuid()) @db.Uuid
  bookingId  String    @map("booking_id") @db.Uuid
  purpose    String // cancel | reschedule | manage
  tokenHash  String    @unique @map("token_hash")
  expiresAt  DateTime  @map("expires_at") @db.Timestamptz(3)
  usedAt     DateTime? @map("used_at") @db.Timestamptz(3)
  createdAt  DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)

  @@index([bookingId])
  @@map("signed_action_tokens")
}

// ---------------------------------------------------------------------------
// Billing (apps/billing) — same database, no FKs into api-owned tables
// ---------------------------------------------------------------------------

enum ProductType {
  ONE_TIME
  RECURRING
}

enum SubscriptionStatus {
  INCOMPLETE
  TRIALING
  ACTIVE
  PAST_DUE
  CANCELED
  UNPAID
  PAUSED
}

enum PaymentStatus {
  REQUIRES_PAYMENT
  SUCCEEDED
  FAILED
  REFUNDED
  PARTIALLY_REFUNDED
  CANCELED
}

enum CreditReason {
  GRANT
  CONSUME
  RELEASE
  PERIOD_RESET
  REFUND
  ADJUSTMENT
}

model Product {
  id                   String      @id @default(uuid()) @db.Uuid
  organizationId       String      @map("organization_id") @db.Uuid
  name                 String
  type                 ProductType
  stripeProductId      String      @unique @map("stripe_product_id")
  creditGrantPerPeriod Int         @default(0) @map("credit_grant_per_period")
  isActive             Boolean     @default(true) @map("is_active")
  createdAt            DateTime    @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt            DateTime    @updatedAt @map("updated_at") @db.Timestamptz(3)

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  prices       Price[]
  subscriptions Subscription[]

  @@index([organizationId])
  @@map("products")
}

model Price {
  id              String   @id @default(uuid()) @db.Uuid
  productId       String   @map("product_id") @db.Uuid
  organizationId  String   @map("organization_id") @db.Uuid
  amountMinor     Int      @map("amount_minor")
  currency        String   @db.Char(3)
  interval        String? // month | year | null for one-time
  intervalCount   Int      @default(1) @map("interval_count")
  stripePriceId   String   @unique @map("stripe_price_id")
  isActive        Boolean  @default(true) @map("is_active")
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz(3)

  product        Product        @relation(fields: [productId], references: [id])
  subscriptions  Subscription[]

  @@index([organizationId])
  @@map("prices")
}

model PlatformAccount {
  organizationId     String    @id @map("organization_id") @db.Uuid
  stripeAccountId    String    @unique @map("stripe_account_id")
  chargesEnabled     Boolean   @default(false) @map("charges_enabled")
  payoutsEnabled     Boolean   @default(false) @map("payouts_enabled")
  detailsSubmitted   Boolean   @default(false) @map("details_submitted")
  createdAt          DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt          DateTime  @updatedAt @map("updated_at") @db.Timestamptz(3)

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@map("platform_accounts")
}

model StripeCustomer {
  id               String @id @default(uuid()) @db.Uuid
  organizationId   String @map("organization_id") @db.Uuid
  customerId       String @map("customer_id") @db.Uuid
  stripeCustomerId String @map("stripe_customer_id")

  @@unique([organizationId, customerId])
  @@unique([stripeCustomerId])
  @@map("stripe_customers")
}

model Subscription {
  id                   String             @id @default(uuid()) @db.Uuid
  organizationId       String             @map("organization_id") @db.Uuid
  customerId           String             @map("customer_id") @db.Uuid
  productId            String             @map("product_id") @db.Uuid
  priceId              String             @map("price_id") @db.Uuid
  stripeSubscriptionId String             @unique @map("stripe_subscription_id")
  status               SubscriptionStatus
  currentPeriodStart   DateTime           @map("current_period_start") @db.Timestamptz(3)
  currentPeriodEnd     DateTime           @map("current_period_end") @db.Timestamptz(3)
  cancelAtPeriodEnd    Boolean            @default(false) @map("cancel_at_period_end")
  createdAt            DateTime           @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt            DateTime           @updatedAt @map("updated_at") @db.Timestamptz(3)

  product Product @relation(fields: [productId], references: [id])
  price   Price   @relation(fields: [priceId], references: [id])
  credits CreditLedgerEntry[]

  @@index([organizationId, customerId])
  @@index([status])
  @@map("subscriptions")
}

model CreditLedgerEntry {
  id             String       @id @default(uuid()) @db.Uuid
  organizationId String       @map("organization_id") @db.Uuid
  customerId     String       @map("customer_id") @db.Uuid
  subscriptionId String?      @map("subscription_id") @db.Uuid
  bookingId      String?      @map("booking_id") @db.Uuid
  delta          Int
  balanceAfter   Int          @map("balance_after")
  reason         CreditReason
  periodStart    DateTime?    @map("period_start") @db.Timestamptz(3)
  periodEnd      DateTime?    @map("period_end") @db.Timestamptz(3)
  createdAt      DateTime     @default(now()) @map("created_at") @db.Timestamptz(3)

  subscription Subscription? @relation(fields: [subscriptionId], references: [id])

  @@index([organizationId, customerId, createdAt])
  @@index([bookingId])
  @@map("credit_ledger_entries")
}

model Payment {
  id                       String        @id @default(uuid()) @db.Uuid
  organizationId           String        @map("organization_id") @db.Uuid
  customerId               String        @map("customer_id") @db.Uuid
  bookingId                String?       @map("booking_id") @db.Uuid
  stripeCheckoutSessionId  String?       @unique @map("stripe_checkout_session_id")
  stripePaymentIntentId    String?       @map("stripe_payment_intent_id")
  amountMinor              Int           @map("amount_minor")
  currency                 String        @db.Char(3)
  applicationFeeMinor      Int           @map("application_fee_minor")
  status                   PaymentStatus
  createdAt                DateTime      @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt                DateTime      @updatedAt @map("updated_at") @db.Timestamptz(3)

  refunds Refund[]

  @@index([organizationId, createdAt])
  @@index([bookingId])
  @@map("payments")
}

model Refund {
  id            String   @id @default(uuid()) @db.Uuid
  paymentId     String   @map("payment_id") @db.Uuid
  amountMinor   Int      @map("amount_minor")
  stripeRefundId String  @unique @map("stripe_refund_id")
  reason        String?
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz(3)

  payment Payment @relation(fields: [paymentId], references: [id])

  @@map("refunds")
}

model Invoice {
  id               String   @id @default(uuid()) @db.Uuid
  organizationId   String   @map("organization_id") @db.Uuid
  customerId       String?  @map("customer_id") @db.Uuid
  stripeInvoiceId  String   @unique @map("stripe_invoice_id")
  amountDueMinor   Int      @map("amount_due_minor")
  amountPaidMinor  Int      @map("amount_paid_minor")
  currency         String   @db.Char(3)
  status           String
  hostedInvoiceUrl String?  @map("hosted_invoice_url")
  pdfUrl           String?  @map("pdf_url")
  createdAt        DateTime @default(now()) @map("created_at") @db.Timestamptz(3)

  @@index([organizationId, createdAt])
  @@map("invoices")
}

model StripeEvent {
  id          String    @id // Stripe event id, evt_...
  type        String
  payload     Json
  processedAt DateTime? @map("processed_at") @db.Timestamptz(3)
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)

  @@index([type, createdAt])
  @@map("stripe_events")
}

// ---------------------------------------------------------------------------
// Notifications (apps/worker)
// ---------------------------------------------------------------------------

enum NotificationChannel {
  EMAIL
  SMS
}

enum NotificationStatus {
  QUEUED
  SENT
  FAILED
}

model NotificationLog {
  id             String              @id @default(uuid()) @db.Uuid
  organizationId String?             @map("organization_id") @db.Uuid
  bookingId      String?             @map("booking_id") @db.Uuid
  channel        NotificationChannel
  template       String
  toAddress      String              @map("to_address")
  providerId     String?             @map("provider_id")
  status         NotificationStatus
  error          String?
  sentAt         DateTime?           @map("sent_at") @db.Timestamptz(3)
  createdAt      DateTime            @default(now()) @map("created_at") @db.Timestamptz(3)

  @@index([bookingId, template])
  @@index([organizationId, createdAt])
  @@map("notification_logs")
}
```

`Organization` currently has relations to billing models (`products`, `platformAccount`). That is convenient for Prisma but **violates service ownership** if billing writes through those relations. Billing repositories must use their own Prisma delegates and never cascade from api-owned graphs. If Prisma complains about a required back-relation, keep the relation but do not expose it on api-side entities.

---

## 3. SQL that Prisma cannot express

Applied as `packages/db/prisma/migrations/<timestamp>_booking_exclusion/migration.sql` **after** the bookings table exists. Do not let `prisma migrate dev` drop this.

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE bookings
  ADD COLUMN occupied tstzrange
    GENERATED ALWAYS AS (
      tstzrange(
        start_at - make_interval(mins => buffer_before_minutes),
        end_at   + make_interval(mins => buffer_after_minutes),
        '[)'
      )
    ) STORED;

-- Double-booking prevention: overlapping occupied ranges for the same host
-- while the booking is still holding the slot.
ALTER TABLE bookings
  ADD CONSTRAINT bookings_host_occupied_excl
  EXCLUDE USING gist (
    host_user_id WITH =,
    occupied WITH &&
  )
  WHERE (status IN ('PENDING_PAYMENT', 'PENDING_CONFIRMATION', 'CONFIRMED'));
```

Check constraints (same migration or a follow-up):

```sql
ALTER TABLE availability_rules
  ADD CONSTRAINT availability_rules_minutes_chk
  CHECK (start_minute >= 0 AND end_minute <= 1440 AND start_minute < end_minute);

ALTER TABLE date_overrides
  ADD CONSTRAINT date_overrides_minutes_chk
  CHECK (
    is_unavailable
    OR (start_minute IS NOT NULL AND end_minute IS NOT NULL
        AND start_minute >= 0 AND end_minute <= 1440 AND start_minute < end_minute)
  );

ALTER TABLE event_types
  ADD CONSTRAINT event_types_duration_chk
  CHECK (duration_minutes > 0 AND duration_minutes <= 24 * 60);

ALTER TABLE bookings
  ADD CONSTRAINT bookings_range_chk
  CHECK (end_at > start_at);
```

pg-boss: on worker boot, `PgBoss.start()` creates its own schema (`pgboss` by default). Do not model those tables in Prisma. Grant the app role `CREATE` on the database or pre-create the schema.

---

## 4. Critical indexes (beyond uniques)

| Index | Why |
| --- | --- |
| `bookings (host_user_id, start_at)` | Slot computation busy set |
| `bookings (organization_id, start_at)` | Dashboard calendar |
| `bookings (status, hold_expires_at)` | Expiry job |
| `external_busy_blocks (host_user_id, start_at, end_at)` | Slot computation |
| `domain_events (status, available_at)` | Outbox poller |
| `webhook_deliveries (status, next_retry_at)` | Dispatcher |
| `idempotency_keys (expires_at)` | Cleanup job |
| `customers (organization_id, email)` unique | Upsert on book |
| `event_types (organization_id, slug)` unique | Public URL |

---

## 5. `organizations.settings` JSON shape

```ts
type OrgSettings = {
  flags?: string[]; // feature flags, e.g. ["outlook_calendar"]
  branding?: { hideSchedflowBadge?: boolean };
  notifications?: { reminderHours?: number[]; smsEnabled?: boolean };
  booking?: { allowReschedule?: boolean; allowCancel?: boolean };
};
```

Unknown keys are preserved. Validate on write with zod (`OrgSettingsSchema` in `@shedflow/shared`).

---

## 6. Event type `questions` JSON

```ts
type Question = {
  id: string; // nanoid, stable
  type: "text" | "textarea" | "phone" | "select" | "checkbox";
  label: string;
  required: boolean;
  options?: string[]; // select
};
```

`bookings.answers` is `{ [questionId]: string | boolean }`.

---

## 7. Migration strategy

1. One Prisma migration per task that changes schema. Name: `YYYYMMDDHHMMSS_<task_id>_<slug>`.
2. Raw SQL for exclusion constraints, extensions, check constraints: a dedicated migration that only contains SQL. Add a comment `-- prisma-ignore` at the top so future diffs do not try to reverse it. Document it in `packages/db/README.md`.
3. Expand/contract for breaking column changes: add new column → dual-write → backfill → switch reads → drop old. MVP is pre-production so we may `migrate reset` locally; **production never resets**.
4. `DIRECT_DATABASE_URL` (non-pooled) for migrations. `DATABASE_URL` may point at a pooler (Neon/PgBouncer transaction mode). Prisma Client in apps uses the pooled URL; migrate job uses direct.
5. Deploy order: migrate job succeeds → start/roll api, billing, worker. Never start a new binary against an old schema if the binary requires new columns (forward-only).
6. Shadow DB: set `SHADOW_DATABASE_URL` on hosted Postgres that forbids `CREATE DATABASE`.

---

## 8. Tenant isolation in persistence

Every tenant-owned repository method **requires** `organizationId` as a first-class argument. There is no `findById(id)` on tenant entities — only `findById(organizationId, id)`. The Prisma `where` always includes both. A code review that sees `findUnique({ where: { id } })` on a tenant table is a defect.

Platform-admin impersonation (T-038) still scopes queries to the impersonated org; it does not unlock unscoped reads.

---

## 9. Seed data (local / e2e)

`packages/db/prisma/seed.ts`:

- User `owner@shedflow.dev` / `Password123!`
- Org `acme` (America/New_York, USD, Pro plan in seed only)
- Default schedule Mon–Fri 09:00–17:00
- Event types: "Intro call" (30m, free), "Coaching" (60m, $150 one-time)
- No real Stripe objects in seed; tests mock Stripe.

---

## 10. What we explicitly do not model in MVP

- Group events / seats / waitlists
- Round-robin pools
- Customer login accounts
- Multi-currency price books
- Notification template rows (templates are code in `packages/emails`)
- Outbox in a separate DB
