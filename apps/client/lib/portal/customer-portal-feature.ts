import { FEATURE_FLAGS, isEnabled } from "@shedflow/shared";

/** Customer portal flag. On in local development unless NEXT_PUBLIC_CUSTOMER_PORTAL=0. */
export function isCustomerPortalEnabled(org?: { settings?: unknown } | null): boolean {
  if (process.env.NEXT_PUBLIC_CUSTOMER_PORTAL === "0") {
    return false;
  }
  if (process.env.NEXT_PUBLIC_CUSTOMER_PORTAL === "1") {
    return true;
  }
  if (process.env.NODE_ENV === "development") {
    return true;
  }
  const envFlags = process.env.NEXT_PUBLIC_FLAGS ?? process.env.FLAGS;
  return isEnabled(FEATURE_FLAGS.customerPortal, org, envFlags);
}
