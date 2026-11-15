import { PortalBookEvent } from "@/components/portal/portal-book";

export default async function PortalBookEventPage({
  params,
}: {
  params: Promise<{ eventSlug: string }>;
}) {
  const { eventSlug } = await params;
  return <PortalBookEvent eventSlug={eventSlug} />;
}
