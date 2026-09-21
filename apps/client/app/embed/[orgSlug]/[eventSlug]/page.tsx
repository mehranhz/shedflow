import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { BookingPageShell } from "@/components/booking/booking-shell";
import { PublicEventLoader } from "@/components/booking/public-event-loader";
import { fetchPublicJson } from "@/lib/public-fetch";
import type { PublicEventType, PublicOrg } from "@/lib/types";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string }>;
}): Promise<Metadata> {
  const { orgSlug, eventSlug } = await params;
  const event = await fetchPublicJson<PublicEventType & { organization?: PublicOrg }>(
    `/v1/public/orgs/${orgSlug}/event-types/${eventSlug}`,
  );
  const title =
    event.kind === "ok"
      ? `${event.data.title} · ${event.data.organization?.name ?? orgSlug}`
      : `${eventSlug} · ${orgSlug}`;
  return { title };
}

export default async function EmbedEventPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string }>;
}) {
  const { orgSlug, eventSlug } = await params;
  const fetched = await fetchPublicJson<PublicEventType & { organization?: PublicOrg }>(
    `/v1/public/orgs/${orgSlug}/event-types/${eventSlug}`,
  );
  if (fetched.kind === "not_found") {
    notFound();
  }

  const organization: PublicOrg | null =
    fetched.kind === "ok"
      ? (fetched.data.organization ?? {
          name: orgSlug,
          slug: orgSlug,
          logoUrl: null,
          brandColor: "#0069ff",
          locale: "en",
          timezone: "UTC",
        })
      : null;

  return (
    <BookingPageShell
      brandColor={organization?.brandColor}
      locale={organization?.locale}
      embed
    >
      <PublicEventLoader
        orgSlug={orgSlug}
        eventSlug={eventSlug}
        embed
        fallbackOrg={organization}
        fallbackEvent={fetched.kind === "ok" ? fetched.data : null}
      />
    </BookingPageShell>
  );
}
