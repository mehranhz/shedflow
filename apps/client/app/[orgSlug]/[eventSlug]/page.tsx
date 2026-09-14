import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { PublicEventLoader } from "@/components/booking/public-event-loader";
import { foregroundOn } from "@/lib/event-colors";
import { PUBLIC_API_URL } from "@/lib/public-config";
import type { PublicEventType, PublicOrg } from "@/lib/types";

const RESERVED = new Set([
  "login",
  "register",
  "dashboard",
  "reset-password",
  "verify-email",
  "invite",
  "api",
  "b",
  "embed",
  "app",
]);

async function fetchPublicJson<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${PUBLIC_API_URL}${path}`, { cache: "no-store" });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string }>;
}): Promise<Metadata> {
  const { orgSlug, eventSlug } = await params;
  const event = await fetchPublicJson<PublicEventType & { organization?: PublicOrg }>(
    `/v1/public/orgs/${orgSlug}/event-types/${eventSlug}`,
  );
  const title = event
    ? `${event.title} · ${event.organization?.name ?? orgSlug}`
    : `${eventSlug} · ${orgSlug}`;
  return { title };
}

export default async function PublicEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string }>;
  searchParams: Promise<{ embed?: string }>;
}) {
  const { orgSlug, eventSlug } = await params;
  const { embed } = await searchParams;
  if (RESERVED.has(orgSlug)) {
    notFound();
  }

  const apiEvent = await fetchPublicJson<PublicEventType & { organization?: PublicOrg }>(
    `/v1/public/orgs/${orgSlug}/event-types/${eventSlug}`,
  );
  const organization: PublicOrg = apiEvent?.organization ?? {
    name: orgSlug,
    slug: orgSlug,
    logoUrl: null,
    brandColor: "#0069ff",
    locale: "en",
    timezone: "UTC",
  };
  const eventType: PublicEventType = apiEvent ?? {
    slug: eventSlug,
    title: eventSlug.replace(/-/g, " "),
    description: "",
    durationMinutes: 30,
    locationType: "GOOGLE_MEET",
    locationValue: null,
    questions: [],
    requiresConfirmation: false,
    price: null,
  };

  const brand = organization.brandColor ?? "#0069ff";
  const hideChrome = embed === "1";

  return (
    <div
      className="min-h-svh bg-[#f4f5f7] px-4 py-8 md:py-16"
      style={
        {
          "--brand": brand,
          "--brand-foreground": foregroundOn(brand),
          "--primary": brand,
        } as React.CSSProperties
      }
    >
      {!hideChrome ? (
        <div className="mx-auto mb-6 flex max-w-4xl items-center justify-between">
          <Link href={`/${orgSlug}`} className="text-sm text-muted-foreground hover:text-foreground">
            ← {organization.name}
          </Link>
          {organization.hideSchedflowBadge ? null : (
            <span className="text-xs text-muted-foreground">Powered by SchedFlow</span>
          )}
        </div>
      ) : null}
      <PublicEventLoader
        orgSlug={orgSlug}
        eventSlug={eventSlug}
        fallbackOrg={organization}
        fallbackEvent={eventType}
        embed={hideChrome}
      />
    </div>
  );
}
