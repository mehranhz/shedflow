"use client";

import { apiBff } from "@/lib/bff";

export type CustomerBusiness = {
  organizationId: string;
  slug: string;
  name: string;
  customerId: string;
  brandColor?: string | null;
  logoUrl?: string | null;
};

export type CustomerAuthSession = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email?: string | null; phone?: string | null };
  businesses?: CustomerBusiness[];
  actorType?: string;
};

type ApiEnvelope<T> = { success: boolean; data?: T; message?: string };

async function postCustomerAuth<T>(
  path: string,
  body: Record<string, string>,
): Promise<T> {
  const envelope = await apiBff<ApiEnvelope<T>>(`customer/auth/${path}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!envelope?.success || !envelope.data) {
    throw new Error(envelope?.message ?? "Customer auth failed");
  }
  return envelope.data;
}

export function loginCustomer(email: string, password: string) {
  return postCustomerAuth<CustomerAuthSession>("login", { email, password });
}

export function registerCustomer(input: {
  email: string;
  password: string;
  name?: string;
}) {
  return postCustomerAuth<CustomerAuthSession>("register", {
    email: input.email,
    password: input.password,
    ...(input.name ? { name: input.name } : {}),
  });
}

export function confirmCustomerClaim(token: string) {
  return postCustomerAuth<CustomerAuthSession>("claim/confirm", { token });
}

/** Enumeration-safe: always succeeds from the client's perspective on 204. */
export async function requestCustomerClaim(email: string): Promise<void> {
  await apiBff<undefined>(`customer/auth/claim`, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}
