import "server-only";

import { cookies } from "next/headers";

import { PORTAL_DUAL_RESOLVED_COOKIE } from "@/lib/portal/constants";

export async function hasResolvedPortalDualRole(): Promise<boolean> {
  const store = await cookies();
  return store.get(PORTAL_DUAL_RESOLVED_COOKIE)?.value === "1";
}
