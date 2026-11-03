import { cookies } from "next/headers";

import { CUSTOMER_ORG_COOKIE } from "@/lib/portal/constants";

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export async function readCustomerOrgCookie(): Promise<string | undefined> {
  const store = await cookies();
  const value = store.get(CUSTOMER_ORG_COOKIE)?.value;
  return value && value.length > 0 ? value : undefined;
}

export async function persistCustomerOrgCookie(orgId?: string): Promise<void> {
  try {
    const store = await cookies();
    if (!orgId) {
      store.delete(CUSTOMER_ORG_COOKIE);
      return;
    }
    store.set(CUSTOMER_ORG_COOKIE, orgId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
      secure: process.env.NODE_ENV === "production",
    });
  } catch {
    // jwt callback may run outside a mutable cookie context.
  }
}
