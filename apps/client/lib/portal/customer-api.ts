"use client";

import { unwrapData } from "@/lib/api-envelope";
import { apiBff } from "@/lib/bff";

import type { CustomerBusiness } from "@/lib/portal/customer-auth-api";

export type CustomerBusinessProfile = {
  organizationId: string;
  organizationName: string;
  name: string;
  phone: string | null;
  updatedAt: string;
};

export type CustomerMe = {
  user: {
    id: string;
    email?: string | null;
    name?: string | null;
    phone?: string | null;
    photoUrl?: string | null;
    timezone?: string;
    locale?: string;
    portal?: {
      timezone: string;
      locale: string;
      reduceMotion: boolean;
      denseText: boolean;
      highContrast: "system";
    };
    updatedAt?: string;
  };
  businesses: CustomerBusiness[];
  activeCustomerOrgId?: string | null;
  activeCustomerId?: string | null;
  businessProfile?: CustomerBusinessProfile | null;
};

export type CustomerProfileInput = {
  name?: string;
  phone?: string | null;
  photoUrl?: string | null;
  timezone?: string;
  locale?: string;
  updatedAt: string;
  portal?: {
    reduceMotion?: boolean;
    denseText?: boolean;
    highContrast?: "system";
  };
  business?: {
    name?: string;
    phone?: string | null;
    updatedAt: string;
  };
};

export function profileEtag(updatedAt: string): string {
  return `W/"${new Date(updatedAt).toISOString()}"`;
}

export type CustomerBookingCard = {
  uid: string;
  status: string;
  startAt: string;
  endAt?: string;
  timezone: string;
  title?: string;
  hostName?: string | null;
  locationType?: string;
  locationValue?: string | null;
  receiptStatus?: string | null;
  seriesId?: string | null;
  eventType?: { title?: string; slug?: string };
  organization?: { id: string; slug?: string; name?: string; brandColor?: string | null };
  durationMinutes?: number;
  description?: string;
  requiresConfirmation?: boolean;
  requiresPaymentReceipt?: boolean;
  paymentInstructions?: string | null;
};

export type CustomerBookingDetail = CustomerBookingCard & {
  answers?: Record<string, unknown>;
  cancellationReason?: string | null;
  customerNote?: string;
  customerNoteEditable?: boolean;
  attachments?: Array<{ url: string; name: string; mimeType: string; sizeBytes: number }>;
  policy?: {
    cancellationNoticeHours: number;
    rescheduleNoticeHours: number;
    noShowPolicySummary: string;
    canCancel: boolean;
    canReschedule: boolean;
    cancelBlockedReason: string | null;
    rescheduleBlockedReason: string | null;
  };
  receipt?: { status: string; rejectionReason?: string | null } | null;
};

export type CustomerHome = {
  nextAppointment: CustomerBookingCard | null;
  actionsNeeded: CustomerBookingCard[];
  receiptsPendingCount: number;
  waitlistCount: number;
  bookHref: string | null;
  organization: { id: string; slug: string; name: string } | null;
  features: { customerRecurring: boolean };
};

export type CustomerBookingsPage = {
  items: CustomerBookingCard[];
  total: number;
};

export async function fetchCustomerMe(customerOrgId?: string): Promise<CustomerMe> {
  const payload = await apiBff<unknown>(
    "customer/me",
    customerOrgId ? { customerOrgId } : undefined,
  );
  const me = unwrapData<CustomerMe>(payload);
  if (!me?.user?.id) {
    throw new Error("Could not load customer profile");
  }
  return me;
}

export async function updateCustomerProfile(
  input: CustomerProfileInput,
  customerOrgId?: string,
): Promise<CustomerMe> {
  const payload = await apiBff<unknown>("customer/me", {
    method: "PATCH",
    customerOrgId,
    ifMatch: profileEtag(input.updatedAt),
    body: JSON.stringify(input),
  });
  const me = unwrapData<CustomerMe>(payload);
  if (!me?.user?.id) {
    throw new Error("Could not save customer profile");
  }
  return me;
}

export async function requestCustomerEmailChange(
  email: string,
  updatedAt: string,
  totpCode?: string,
): Promise<void> {
  await apiBff("customer/me/email", {
    method: "POST",
    ifMatch: profileEtag(updatedAt),
    body: JSON.stringify({
      email,
      updatedAt,
      ...(totpCode ? { totpCode } : {}),
    }),
  });
}

export async function confirmCustomerEmailChange(token: string): Promise<CustomerMe> {
  const payload = await apiBff<unknown>("customer/me/email/confirm", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
  return unwrapData<CustomerMe>(payload);
}

export async function switchCustomerBusiness(organizationId: string): Promise<string> {
  const payload = await apiBff<unknown>(
    `customer/businesses/${organizationId}/switch`,
    { method: "POST" },
  );
  const switched = unwrapData<{ accessToken?: string }>(payload);
  if (!switched?.accessToken) {
    throw new Error("Could not switch business");
  }
  return switched.accessToken;
}

export async function fetchCustomerBookings(
  customerOrgId: string,
  query?: Record<string, string>,
): Promise<CustomerBookingsPage> {
  const params = new URLSearchParams(query);
  const qs = params.toString();
  return apiBff<CustomerBookingsPage>(
    `customer/bookings${qs ? `?${qs}` : ""}`,
    { customerOrgId },
  );
}

export function fetchCustomerHome(customerOrgId: string): Promise<CustomerHome> {
  return apiBff<CustomerHome>("customer/home", { customerOrgId });
}

export function fetchCustomerBooking(
  customerOrgId: string,
  uid: string,
): Promise<CustomerBookingDetail> {
  return apiBff<CustomerBookingDetail>(
    `customer/bookings/${encodeURIComponent(uid)}`,
    { customerOrgId },
  );
}

export function cancelCustomerBooking(
  customerOrgId: string,
  uid: string,
  body: { reason?: string; scope?: "single" | "this_and_future" },
  idempotencyKey: string,
): Promise<CustomerBookingDetail> {
  return apiBff<CustomerBookingDetail>(
    `customer/bookings/${encodeURIComponent(uid)}/cancel`,
    {
      method: "POST",
      customerOrgId,
      idempotencyKey,
      body: JSON.stringify(body),
    },
  );
}

export function saveCustomerNote(
  customerOrgId: string,
  uid: string,
  customerNote: string,
): Promise<CustomerBookingDetail> {
  return apiBff<CustomerBookingDetail>(
    `customer/bookings/${encodeURIComponent(uid)}/note`,
    {
      method: "PATCH",
      customerOrgId,
      body: JSON.stringify({ customerNote }),
    },
  );
}

export type NotificationPrefs = {
  organizationId: string | null;
  scope: "user" | "organization";
  override: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;
  smsAvailable: boolean;
  pushAvailable: boolean;
  remindersEnabled: boolean;
  marketingEnabled: boolean;
  receiptsEnabled: boolean;
  waitlistEnabled: boolean;
  messagesEnabled: boolean;
  confirmationsEnabled: true;
  securityEmailsRequired: true;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  timezone: string;
  updatedAt: string | null;
};

export type NotificationPrefsInput = {
  emailEnabled?: boolean;
  smsEnabled?: boolean;
  pushEnabled?: boolean;
  remindersEnabled?: boolean;
  marketingEnabled?: boolean;
  receiptsEnabled?: boolean;
  waitlistEnabled?: boolean;
  messagesEnabled?: boolean;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
  timezone?: string;
};

function notificationPrefsPath(organizationId?: string | null): string {
  if (!organizationId) {
    return "customer/notifications/prefs";
  }
  return `customer/notifications/prefs?organizationId=${encodeURIComponent(organizationId)}`;
}

export async function fetchNotificationPrefs(
  organizationId?: string | null,
): Promise<NotificationPrefs> {
  const payload = await apiBff<unknown>(notificationPrefsPath(organizationId));
  return unwrapData<NotificationPrefs>(payload);
}

export async function updateNotificationPrefs(
  input: NotificationPrefsInput,
  organizationId?: string | null,
): Promise<NotificationPrefs> {
  const payload = await apiBff<unknown>(notificationPrefsPath(organizationId), {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return unwrapData<NotificationPrefs>(payload);
}

export type SecurityOverview = {
  totpEnabled: boolean;
  backupCodesRemaining: number;
};

export type SecuritySession = {
  id: string;
  device: string;
  userAgent: string | null;
  ip: string | null;
  lastUsedAt: string;
  createdAt: string;
  current: boolean;
};

export function fetchSecurityOverview(): Promise<SecurityOverview> {
  return apiBff<SecurityOverview>("customer/security");
}

export function fetchSecuritySessions(): Promise<{ sessions: SecuritySession[] }> {
  return apiBff<{ sessions: SecuritySession[] }>("customer/security/sessions");
}

export function changeCustomerPassword(input: {
  currentPassword: string;
  newPassword: string;
  revokeOtherSessions?: boolean;
  totpCode?: string;
}): Promise<{ changed: true }> {
  return apiBff("customer/security/password", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function enrollCustomerTotp(): Promise<{ secret: string; otpauthUrl: string }> {
  return apiBff("customer/security/totp/enroll", { method: "POST" });
}

export function confirmCustomerTotp(code: string): Promise<{ backupCodes: string[] }> {
  return apiBff("customer/security/totp/confirm", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export function disableCustomerTotp(password: string, code: string): Promise<void> {
  return apiBff("customer/security/totp/disable", {
    method: "POST",
    body: JSON.stringify({ password, code }),
  });
}

export function revokeCustomerSession(id: string): Promise<void> {
  return apiBff(`customer/security/sessions/${id}`, { method: "DELETE" });
}

export function revokeOtherCustomerSessions(): Promise<void> {
  return apiBff("customer/security/sessions/revoke-all", {
    method: "POST",
    body: JSON.stringify({ keepCurrent: true }),
  });
}

export type ConsentDecision = {
  granted: boolean;
  consentedAt: string | null;
};

export type LinkedPrivacyBusiness = {
  organizationId: string;
  slug: string;
  name: string;
  customerId: string;
  brandColor: string | null;
  logoUrl: string | null;
  lastBookingAt: string | null;
};

export type PrivacyOverview = {
  consents: {
    marketingEmail: ConsentDecision;
    marketingOffers: ConsentDecision;
  };
  businesses: LinkedPrivacyBusiness[];
  links: {
    privacyPolicy: string;
    terms: string;
    export: string;
    deleteAccount: string;
  };
};

export type PrivacyConsentInput = {
  marketingEmail?: boolean;
  marketingOffers?: boolean;
};

export async function fetchPrivacyOverview(): Promise<PrivacyOverview> {
  const payload = await apiBff<unknown>("customer/privacy");
  return unwrapData<PrivacyOverview>(payload);
}

export async function updatePrivacyConsents(input: PrivacyConsentInput): Promise<PrivacyOverview> {
  const payload = await apiBff<unknown>("customer/privacy/consents", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return unwrapData<PrivacyOverview>(payload);
}

export async function disconnectPrivacyBusiness(organizationId: string): Promise<PrivacyOverview> {
  const payload = await apiBff<unknown>(
    `customer/privacy/businesses/${encodeURIComponent(organizationId)}/disconnect`,
    { method: "POST" },
  );
  return unwrapData<PrivacyOverview>(payload);
}

export function addCustomerAttachment(
  customerOrgId: string,
  uid: string,
  body: { url: string; name: string; mimeType: string; sizeBytes: number },
): Promise<CustomerBookingDetail> {
  return apiBff<CustomerBookingDetail>(
    `customer/bookings/${encodeURIComponent(uid)}/attachments`,
    {
      method: "POST",
      customerOrgId,
      body: JSON.stringify(body),
    },
  );
}
