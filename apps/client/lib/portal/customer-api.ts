"use client";

import { apiBff } from "@/lib/bff";

import type { CustomerBusiness } from "@/lib/portal/customer-auth-api";

type ApiEnvelope<T> = { success: boolean; data?: T };

export type CustomerMe = {
  user: { id: string; email?: string | null; name?: string | null; phone?: string | null };
  businesses: CustomerBusiness[];
  activeCustomerOrgId?: string | null;
  activeCustomerId?: string | null;
};

export type CustomerBookingsPage = {
  items: Array<{
    uid: string;
    status: string;
    startAt: string;
    timezone: string;
    title?: string;
    eventType?: { title?: string };
    organization?: { id: string; slug?: string; name?: string; brandColor?: string | null };
  }>;
  total: number;
};

export async function fetchCustomerMe(): Promise<CustomerMe> {
  const envelope = await apiBff<ApiEnvelope<CustomerMe>>("customer/me");
  if (!envelope.success || !envelope.data) {
    throw new Error("Could not load customer profile");
  }
  return envelope.data;
}

export async function switchCustomerBusiness(organizationId: string): Promise<string> {
  const envelope = await apiBff<
    ApiEnvelope<{ accessToken: string; customerOrgId: string; customerId: string }>
  >(`customer/businesses/${organizationId}/switch`, { method: "POST" });
  if (!envelope.success || !envelope.data?.accessToken) {
    throw new Error("Could not switch business");
  }
  return envelope.data.accessToken;
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
