import type { Session } from "next-auth";

export function sanitizePortalNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/portal") || next.startsWith("//")) {
    return "/portal";
  }
  return next;
}

/**
 * After customer portal sign-in: honor `next`, otherwise home.
 * Dual staff+customer chooser is handled on first `/portal` visit (see choose page).
 */
export function postCustomerLoginPath(next: string | null | undefined): string {
  return sanitizePortalNext(next);
}

export function isStaffSession(session: Session | null): boolean {
  return Boolean(session?.role);
}

export function isCustomerSession(session: Session | null): boolean {
  return session?.actorType === "CUSTOMER" || Boolean(session?.customerOrgId);
}
