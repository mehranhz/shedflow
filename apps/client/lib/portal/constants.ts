export const CUSTOMER_ORG_COOKIE = "sf_customer_org";

/** Set when a dual staff+customer actor picks portal vs dashboard. */
export const PORTAL_DUAL_RESOLVED_COOKIE = "sf_portal_dual_resolved";

/** Portal segments that must not require a session (PWA + auth entry). */
export const PUBLIC_PORTAL_PREFIXES = [
  "/portal/login",
  "/portal/register",
  "/portal/claim",
  "/portal/offline",
  "/portal/privacy",
  "/portal/staff",
] as const;

export function isPublicPortalPath(pathname: string): boolean {
  return PUBLIC_PORTAL_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function isProtectedPortalPath(pathname: string): boolean {
  if (!pathname.startsWith("/portal")) {
    return false;
  }
  return !isPublicPortalPath(pathname);
}
