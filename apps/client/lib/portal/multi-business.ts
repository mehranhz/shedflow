/**
 * Multi-business aggregation data layer (T-080).
 *
 * Uses live `/v1/customer/*` APIs when Wave 9–11 are present; otherwise returns
 * documented stub fixtures so the All-businesses UI can ship without rebuilding
 * home/appointments ownership.
 */

export type AggregatedAppointment = {
  uid: string;
  organizationId: string;
  organizationSlug: string;
  organizationName: string;
  brandColor: string | null;
  startAt: string;
  timezone: string;
  title: string;
  status: string;
};

export type MultiBusinessSource = "api" | "stub" | "empty";

export type MultiBusinessResult = {
  source: MultiBusinessSource;
  appointments: AggregatedAppointment[];
  message?: string;
};

const STUB_APPOINTMENTS: AggregatedAppointment[] = [
  {
    uid: "stub-acme-1",
    organizationId: "00000000-0000-4000-8000-000000000001",
    organizationSlug: "acme",
    organizationName: "Acme Studio",
    brandColor: "#0f766e",
    startAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    timezone: "America/New_York",
    title: "Intro call",
    status: "CONFIRMED",
  },
  {
    uid: "stub-north-1",
    organizationId: "00000000-0000-4000-8000-000000000002",
    organizationSlug: "northwind",
    organizationName: "Northwind Wellness",
    brandColor: "#1d4ed8",
    startAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    timezone: "America/Los_Angeles",
    title: "Follow-up",
    status: "CONFIRMED",
  },
];

type ApiBookingRow = {
  uid: string;
  organizationId: string;
  organizationSlug?: string;
  organizationName?: string;
  brandColor?: string | null;
  startAt: string;
  timezone: string;
  title?: string;
  eventTypeTitle?: string;
  status: string;
};

/**
 * Relative label that respects each appointment's IANA zone (T-080).
 */
export function formatRelativeInZone(
  iso: string,
  timeZone: string,
  now = new Date(),
): string {
  const start = new Date(iso);
  const diffMs = start.getTime() - now.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const absolute = new Intl.DateTimeFormat(undefined, {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(start);

  if (diffMs < 0) {
    return absolute;
  }
  if (diffMs < dayMs) {
    return `Today · ${absolute}`;
  }
  if (diffMs < 2 * dayMs) {
    return `Tomorrow · ${absolute}`;
  }
  const days = Math.round(diffMs / dayMs);
  return `In ${days} days · ${absolute}`;
}

export function buildAppointmentHref(
  item: AggregatedAppointment,
  setActiveOrg?: (organizationId: string) => void,
): string {
  setActiveOrg?.(item.organizationId);
  return `/portal/appointments/${encodeURIComponent(item.uid)}`;
}

/**
 * Fetch aggregated upcoming appointments across linked businesses.
 * Falls back to stub data when customer APIs are not yet available.
 */
export async function fetchAggregatedUpcoming(options?: {
  accessToken?: string | null;
  apiBase?: string;
  allowStub?: boolean;
}): Promise<MultiBusinessResult> {
  const allowStub = options?.allowStub !== false;
  const apiBase =
    options?.apiBase ??
    (typeof process !== "undefined"
      ? (process.env.NEXT_PUBLIC_API_URL ?? process.env.API_URL ?? "")
      : "");

  if (!options?.accessToken) {
    return allowStub
      ? {
          source: "stub",
          appointments: STUB_APPOINTMENTS,
          message:
            "Showing stub multi-business data until customer login (T-041/T-044) is available.",
        }
      : { source: "empty", appointments: [] };
  }

  try {
    const headers: HeadersInit = {
      Accept: "application/json",
      Authorization: `Bearer ${options.accessToken}`,
    };
    const res = await fetch(`${apiBase}/v1/customer/bookings?status=CONFIRMED`, {
      headers,
      cache: "no-store",
    });
    if (res.status === 404 || res.status === 501) {
      return allowStub
        ? {
            source: "stub",
            appointments: STUB_APPOINTMENTS,
            message: "Customer bookings API not ready — stub aggregation.",
          }
        : { source: "empty", appointments: [] };
    }
    if (!res.ok) {
      throw new Error(`bookings ${res.status}`);
    }
    const body = (await res.json()) as {
      items?: ApiBookingRow[];
      data?: { items?: ApiBookingRow[] };
    };
    const rows = body.items ?? body.data?.items ?? [];
    const appointments: AggregatedAppointment[] = rows.map((row) => ({
      uid: row.uid,
      organizationId: row.organizationId,
      organizationSlug: row.organizationSlug ?? "org",
      organizationName: row.organizationName ?? "Business",
      brandColor: row.brandColor ?? null,
      startAt: row.startAt,
      timezone: row.timezone,
      title: row.title ?? row.eventTypeTitle ?? "Appointment",
      status: row.status,
    }));
    appointments.sort((a, b) => a.startAt.localeCompare(b.startAt));
    return { source: "api", appointments };
  } catch {
    return allowStub
      ? {
          source: "stub",
          appointments: STUB_APPOINTMENTS,
          message: "Could not reach customer API — stub aggregation.",
        }
      : { source: "empty", appointments: [] };
  }
}
