"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { SlotPicker } from "@/components/booking/slot-picker";
import { usePortalBusiness } from "@/components/portal/portal-business-context";
import { PortalEmptyState, PortalErrorState, PortalSkeleton } from "@/components/portal/portal-states";
import { publicApi } from "@/lib/public-api";
import { fetchCustomerHome, fetchCustomerMe } from "@/lib/portal/customer-api";
import type { PublicEventType, PublicOrg } from "@/lib/types";

export function PortalBookList() {
  const t = useTranslations("portal.book");
  const { activeBusiness } = usePortalBusiness();
  const slug = activeBusiness?.slug;
  const events = useQuery({
    queryKey: ["portal-event-types", slug],
    queryFn: () => publicApi<PublicEventType[]>(`/v1/public/orgs/${slug}/event-types`),
    enabled: Boolean(slug),
  });

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("subtitle", { business: activeBusiness?.name ?? "" })}
        </p>
      </div>
      {events.isLoading ? <PortalSkeleton rows={3} /> : null}
      {events.isError ? (
        <PortalErrorState
          message={events.error instanceof Error ? events.error.message : t("empty")}
          onRetry={() => void events.refetch()}
        />
      ) : null}
      {!events.isLoading && (events.data?.length ?? 0) === 0 ? (
        <PortalEmptyState title={t("empty")} description={t("subtitle", { business: activeBusiness?.name ?? "" })} />
      ) : null}
      <ul className="divide-y rounded-lg border">
        {(events.data ?? []).map((event) => (
          <li key={event.slug}>
            <Link
              href={`/portal/book/${encodeURIComponent(event.slug)}`}
              className="flex min-h-11 flex-col px-4 py-3 hover:bg-muted/50"
            >
              <span className="font-medium">{event.title}</span>
              <span className="text-sm text-muted-foreground">{event.durationMinutes} min</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PortalBookEvent({ eventSlug }: { eventSlug: string }) {
  const t = useTranslations("portal.book");
  const { activeBusiness } = usePortalBusiness();
  const slug = activeBusiness?.slug;
  const orgId = activeBusiness?.organizationId;
  const event = useQuery({
    queryKey: ["portal-event", slug, eventSlug],
    queryFn: () =>
      publicApi<PublicEventType & { organization?: PublicOrg }>(
        `/v1/public/orgs/${slug}/event-types/${eventSlug}`,
      ),
    enabled: Boolean(slug),
  });
  const me = useQuery({ queryKey: ["customer-me"], queryFn: () => fetchCustomerMe() });
  const home = useQuery({
    queryKey: ["customer-home", orgId],
    queryFn: () => fetchCustomerHome(orgId!),
    enabled: Boolean(orgId),
  });

  if (!slug || event.isLoading || me.isLoading) {
    return <PortalSkeleton rows={4} />;
  }
  if (event.isError || !event.data) {
    return (
      <PortalErrorState
        message={event.error instanceof Error ? event.error.message : t("empty")}
        onRetry={() => void event.refetch()}
      />
    );
  }

  const organization: PublicOrg = event.data.organization ?? {
    name: activeBusiness?.name ?? slug,
    slug,
    logoUrl: null,
    brandColor: activeBusiness?.brandColor ?? null,
    locale: "en",
    timezone: "UTC",
  };

  return (
    <div className="space-y-4">
      <Link href="/portal/book" className="text-sm underline">
        {t("back")}
      </Link>
      <SlotPicker
        orgSlug={slug}
        eventSlug={eventSlug}
        eventType={event.data}
        organization={organization}
        portalBooking={{
          customerOrgId: orgId ?? "",
          name: me.data?.user.name ?? "",
          phone: me.data?.user.phone ?? "",
          timezone: me.data?.user.timezone,
          recurringEnabled: home.data?.features.customerRecurring ?? false,
        }}
      />
    </div>
  );
}
