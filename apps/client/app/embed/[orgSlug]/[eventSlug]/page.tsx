import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { PublicEventLoader } from "@/components/booking/public-event-loader";
import { PUBLIC_API_URL } from "@/lib/public-config";
import type { PublicEventType, PublicOrg } from "@/lib/types";

async function fetchPublicJson<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${PUBLIC_API_URL}${path}`, {
      cache: "no-store",
      credentials: "include",
    });
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

export default async function EmbedEventPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string }>;
}) {
  const { orgSlug, eventSlug } = await params;
  const apiEvent = await fetchPublicJson<PublicEventType & { organization?: PublicOrg }>(
    `/v1/public/orgs/${orgSlug}/event-types/${eventSlug}`,
  );
  if (!apiEvent) {
    notFound();
  }
  const organization: PublicOrg = apiEvent.organization ?? {
    name: orgSlug,
    slug: orgSlug,
    logoUrl: null,
    brandColor: "#0069ff",
    locale: "en",
    timezone: "UTC",
  };

  return (
    <div className="min-h-svh bg-background p-2">
      <PublicEventLoader
        orgSlug={orgSlug}
        eventSlug={eventSlug}
        embed
        fallbackOrg={organization}
        fallbackEvent={apiEvent}
      />
    </div>
  );
}
