/**
 * Customer portal analytics (Wave 10 T-047).
 * No invitee PII in payloads — see docs/design/mvp/10-security-and-privacy.md.
 */

export type PortalAnalyticsEvent =
  | "portal_view"
  | "portal_book_start"
  | "portal_cancel"
  | "portal_receipt_upload";

const PII_KEY = /email|phone|name|invitee|customer/i;

type PortalAnalyticsProps = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    __schedflowTrack?: (event: string, props?: PortalAnalyticsProps) => void;
  }
}

function sanitizeProps(props?: PortalAnalyticsProps): PortalAnalyticsProps | undefined {
  if (!props) {
    return undefined;
  }
  const safe: PortalAnalyticsProps = {};
  for (const [key, value] of Object.entries(props)) {
    if (PII_KEY.test(key)) {
      continue;
    }
    if (value !== undefined) {
      safe[key] = value;
    }
  }
  return Object.keys(safe).length ? safe : undefined;
}

export function trackPortalEvent(
  event: PortalAnalyticsEvent,
  props?: PortalAnalyticsProps,
): void {
  const payload = sanitizeProps(props);
  if (typeof window !== "undefined" && typeof window.__schedflowTrack === "function") {
    window.__schedflowTrack(event, payload);
    return;
  }
  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console -- dev-only no-op collector
    console.debug("[portal-analytics]", event, payload ?? {});
  }
}
