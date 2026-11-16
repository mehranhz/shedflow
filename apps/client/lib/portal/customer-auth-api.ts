"use client";

import { unwrapData } from "@/lib/api-envelope";
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

async function postCustomerAuth<T>(
  path: string,
  body: Record<string, string>,
): Promise<T> {
  const payload = await apiBff<unknown>(`customer/auth/${path}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return unwrapData<T>(payload);
}

export type CustomerLoginResult =
  | { mfaRequired: true; mfaToken: string }
  | CustomerAuthSession;

export async function loginCustomer(
  phone: string,
  password: string,
): Promise<CustomerLoginResult> {
  const payload = await apiBff<unknown>("customer/auth/login", {
    method: "POST",
    body: JSON.stringify({ phone, password }),
  });
  const data = unwrapData<Record<string, unknown>>(payload);
  if (data.mfaRequired === true && typeof data.mfaToken === "string") {
    return { mfaRequired: true, mfaToken: data.mfaToken };
  }
  if (
    typeof data.accessToken !== "string" ||
    typeof data.refreshToken !== "string" ||
    !data.user ||
    typeof data.user !== "object"
  ) {
    throw new Error("Sign in failed");
  }
  return data as CustomerAuthSession;
}

export function completeCustomerMfaLogin(mfaToken: string, code: string) {
  return postCustomerAuth<CustomerAuthSession>("login/totp", { mfaToken, code });
}

export function registerCustomer(input: {
  phone: string;
  password: string;
  name?: string;
}) {
  return postCustomerAuth<CustomerAuthSession>("register", {
    phone: input.phone,
    password: input.password,
    ...(input.name ? { name: input.name } : {}),
  });
}

export function confirmCustomerClaim(token: string) {
  return postCustomerAuth<CustomerAuthSession>("claim/confirm", { token });
}

/** Enumeration-safe: always succeeds from the client's perspective on 204. */
export async function requestCustomerClaim(phone: string): Promise<void> {
  await apiBff<undefined>(`customer/auth/claim`, {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
}
