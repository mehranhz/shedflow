import type { Metadata } from "next";

import { OrgEventList } from "@/components/booking/org-event-list";
import { fetchPublicJson } from "@/lib/public-fetch";
import type { PublicEventType, PublicOrg } from "@/lib/types";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}): Promise<Metadata> {
  const { orgSlug } = await params;
  const org = await fetchPublicJson<PublicOrg>(`/v1/public/orgs/${orgSlug}`);
  return { title: org.kind === "ok" ? org.data.name : orgSlug };
}

export default async function PublicOrgPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ embed?: string }>;
}) {
  const { orgSlug } = await params;
  const { embed } = await searchParams;
  const hideChrome = embed === "1";

  const [org, events] = await Promise.all([
    fetchPublicJson<PublicOrg>(`/v1/public/orgs/${orgSlug}`),
    fetchPublicJson<PublicEventType[] | { items: PublicEventType[] }>(
      `/v1/public/orgs/${orgSlug}/event-types`,
    ),
  ]);

  const initialOrg = org.kind === "ok" ? org.data : null;
  const initialEvents =
    events.kind === "ok"
      ? Array.isArray(events.data)
        ? events.data
        : events.data.items
      : undefined;

  return (
    <OrgEventList
      orgSlug={orgSlug}
      embed={hideChrome}
      initialOrg={initialOrg}
      initialEvents={initialEvents}
    />
  );
}
