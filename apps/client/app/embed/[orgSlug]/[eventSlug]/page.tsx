import { PublicEventLoader } from "@/components/booking/public-event-loader";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string }>;
}): Promise<Metadata> {
  const { orgSlug, eventSlug } = await params;
  return { title: `${eventSlug} · ${orgSlug}` };
}

export default async function EmbedEventPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string }>;
}) {
  const { orgSlug, eventSlug } = await params;
  return (
    <div className="min-h-svh bg-background p-2">
      <PublicEventLoader
        orgSlug={orgSlug}
        eventSlug={eventSlug}
        embed
        fallbackOrg={{
          name: orgSlug,
          slug: orgSlug,
          logoUrl: null,
          brandColor: "#0069ff",
          locale: "en",
          timezone: "UTC",
        }}
        fallbackEvent={{
          slug: eventSlug,
          title: eventSlug.replace(/-/g, " "),
          description: "",
          durationMinutes: 30,
          locationType: "GOOGLE_MEET",
          locationValue: null,
          questions: [],
          requiresConfirmation: false,
          price: null,
        }}
      />
    </div>
  );
}
