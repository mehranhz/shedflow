"use client";

import { unwrapData } from "@/lib/api-envelope";
import { apiBff } from "@/lib/bff";

import type { CustomerBusiness } from "@/lib/portal/customer-auth-api";

export type CustomerMe = {
  user: { id: string; email?: string | null; name?: string | null; phone?: string | null };
  businesses: CustomerBusiness[];
  activeCustomerOrgId?: string | null;
  activeCustomerId?: string | null;
};

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

export async function fetchCustomerMe(): Promise<CustomerMe> {
  const payload = await apiBff<unknown>("customer/me");
  const me = unwrapData<CustomerMe>(payload);
  if (!me?.user?.id) {
    throw new Error("Could not load customer profile");
  }
  return me;
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
