export type OrgRole = "OWNER" | "ADMIN" | "MEMBER";
export type PlatformPlan = "FREE" | "PRO";

export type Organization = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  locale: string;
  currency: string;
  logoUrl: string | null;
  brandColor: string | null;
  platformPlan: PlatformPlan;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type OnboardingFlags = {
  orgProfile?: boolean;
  calendar?: boolean;
  availability?: boolean;
  eventType?: boolean;
  copyLink?: boolean;
  stripe?: boolean;
  dismissed?: boolean;
};

export type AuthMembership = {
  organizationId: string;
  role: OrgRole;
  status: "ACTIVE" | "DISABLED";
};

export type AuthProfile = {
  id: string;
  email: string;
  createdAt: string;
  emailVerifiedAt: string | null;
  memberships: AuthMembership[];
  activeOrganization: Organization | null;
  impersonatingOrgId?: string | null;
};

export type Member = {
  id: string;
  organizationId: string;
  userId: string;
  email: string;
  role: OrgRole;
  status: "ACTIVE" | "DISABLED";
  createdAt: string;
};

export type Invitation = {
  id: string;
  organizationId: string;
  email: string;
  role: "ADMIN" | "MEMBER";
  expiresAt: string;
  createdAt: string;
};

export type LocationType =
  | "GOOGLE_MEET"
  | "LINK"
  | "PHONE"
  | "IN_PERSON"
  | "CUSTOM";

export type Question = {
  id: string;
  type: "text" | "textarea" | "phone" | "select" | "checkbox";
  label: string;
  required: boolean;
  options?: string[];
};

export type EventType = {
  id: string;
  organizationId: string;
  hostUserId: string;
  scheduleId: string;
  slug: string;
  title: string;
  description: string;
  durationMinutes: number;
  locationType: LocationType;
  locationValue: string | null;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  minNoticeMinutes: number;
  maxDaysAhead: number;
  slotIntervalMinutes: number;
  dailyCap: number | null;
  requiresConfirmation: boolean;
  cancellationNoticeHours: number;
  rescheduleNoticeHours: number;
  priceId: string | null;
  subscriptionProductId: string | null;
  creditCost: number;
  questions: Question[];
  isActive: boolean;
  isHidden: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AvailabilityRule = {
  id?: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
};

export type DateOverride = {
  id?: string;
  date: string;
  isUnavailable: boolean;
  startMinute: number | null;
  endMinute: number | null;
};

export type Schedule = {
  id: string;
  organizationId: string;
  hostUserId: string;
  name: string;
  timezone: string;
  isDefault: boolean;
  rules: AvailabilityRule[];
  overrides: DateOverride[];
  createdAt: string;
  updatedAt: string;
};

export type BookingStatus =
  | "PENDING_PAYMENT"
  | "PENDING_CONFIRMATION"
  | "CONFIRMED"
  | "CANCELLED"
  | "RESCHEDULED"
  | "EXPIRED"
  | "NO_SHOW";

export type BookingSource = "HOSTED" | "EMBED" | "API" | "DASHBOARD";

export type Customer = {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  phone: string | null;
  timezone: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type Booking = {
  id: string;
  uid: string;
  organizationId: string;
  eventTypeId: string;
  hostUserId: string;
  customerId: string;
  startAt: string;
  endAt: string;
  timezone: string;
  status: BookingStatus;
  source: BookingSource;
  locationType: LocationType;
  locationValue: string | null;
  answers: Record<string, string | boolean>;
  cancellationReason: string | null;
  rescheduledFromId: string | null;
  paymentId?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  eventType?: Pick<EventType, "id" | "title" | "slug" | "durationMinutes">;
  customer?: Pick<Customer, "id" | "name" | "email" | "phone">;
  checkoutUrl?: string | null;
};

export type Slot = {
  startAt: string;
  endAt: string;
  startLocal: string;
  endLocal: string;
};

export type SlotList = {
  timezone: string;
  stale: boolean;
  truncated: boolean;
  slots: Slot[];
};

export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pageCount: number;
};

export type PublicOrg = {
  name: string;
  slug: string;
  logoUrl: string | null;
  brandColor: string | null;
  locale: string;
  timezone: string;
  hideSchedflowBadge?: boolean;
};

export type PublicEventType = {
  slug: string;
  title: string;
  description: string;
  durationMinutes: number;
  locationType: LocationType;
  locationValue: string | null;
  questions: Question[];
  requiresConfirmation: boolean;
  price: { amountMinor: number; currency: string } | null;
};

export type DataSource = "api" | "preview";
