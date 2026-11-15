import { unwrapData } from "@/lib/api-envelope";
import { auth } from "@/auth";
import { API_URL } from "@/lib/config";
import { readCustomerOrgCookie } from "@/lib/portal/customer-cookies";

import type { CustomerMe } from "@/lib/portal/customer-api";

export async function fetchCustomerMeServer(): Promise<CustomerMe | null> {
  const session = await auth();
  if (!session?.accessToken) {
    return null;
  }

  const customerOrg =
    (await readCustomerOrgCookie()) ?? session.customerOrgId ?? undefined;

  const headers: HeadersInit = {
    Accept: "application/json",
    Authorization: `Bearer ${session.accessToken}`,
    ...(customerOrg ? { "X-Customer-Org-Id": customerOrg } : {}),
  };

  const response = await fetch(`${API_URL}/v1/customer/me`, {
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  return unwrapData<CustomerMe>(await response.json());
}
