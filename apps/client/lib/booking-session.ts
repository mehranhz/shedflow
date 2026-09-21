export type BookingActionTokens = {
  manage?: string;
  cancel?: string;
  reschedule?: string;
};

export type BookingSession = {
  orgSlug: string;
  eventSlug: string;
  tokens: BookingActionTokens;
};

const PREFIX = "sf-booking-ctx-";

export function saveBookingSession(uid: string, session: BookingSession): void {
  try {
    sessionStorage.setItem(`${PREFIX}${uid}`, JSON.stringify(session));
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export function readBookingSession(uid: string): BookingSession | null {
  try {
    const raw = sessionStorage.getItem(`${PREFIX}${uid}`);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as BookingSession;
  } catch {
    return null;
  }
}

export function tokenFor(
  uid: string,
  purpose: keyof BookingActionTokens,
  fallback = "",
): string {
  return readBookingSession(uid)?.tokens[purpose] || fallback;
}

function firstNonEmpty(...values: Array<string | null | undefined>): string {
  return values.find((value) => typeof value === "string" && value.length > 0) ?? "";
}

export function bookingQuery(
  uid: string,
  searchParams?: URLSearchParams | { get(name: string): string | null },
): string {
  const session = readBookingSession(uid);
  const fromSearch = (name: string) => searchParams?.get(name) ?? "";
  const params = new URLSearchParams();
  const token = firstNonEmpty(fromSearch("token"), fromSearch("manage"), session?.tokens.manage);
  const cancel = firstNonEmpty(fromSearch("cancel"), session?.tokens.cancel);
  const reschedule = firstNonEmpty(fromSearch("reschedule"), session?.tokens.reschedule);
  const org = firstNonEmpty(fromSearch("org"), session?.orgSlug);
  const event = firstNonEmpty(fromSearch("event"), session?.eventSlug);
  if (token) {
    params.set("token", token);
  }
  if (cancel) {
    params.set("cancel", cancel);
  }
  if (reschedule) {
    params.set("reschedule", reschedule);
  }
  if (org) {
    params.set("org", org);
  }
  if (event) {
    params.set("event", event);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function manageQuery(uid: string, fallbackToken = ""): string {
  const extra = fallbackToken ? new URLSearchParams({ token: fallbackToken }) : undefined;
  return bookingQuery(uid, extra);
}

export function resolveBookingContext(
  uid: string,
  searchParams: { get(name: string): string | null },
): {
  manageToken: string;
  cancelToken: string;
  rescheduleToken: string;
  orgSlug: string;
  eventSlug: string;
} {
  const session = readBookingSession(uid);
  return {
    manageToken: firstNonEmpty(
      searchParams.get("token"),
      searchParams.get("manage"),
      session?.tokens.manage,
    ),
    cancelToken: firstNonEmpty(searchParams.get("cancel"), session?.tokens.cancel),
    rescheduleToken: firstNonEmpty(
      searchParams.get("reschedule"),
      session?.tokens.reschedule,
    ),
    orgSlug: firstNonEmpty(searchParams.get("org"), session?.orgSlug),
    eventSlug: firstNonEmpty(searchParams.get("event"), session?.eventSlug),
  };
}
