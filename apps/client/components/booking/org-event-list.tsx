"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription, AlertTitle, Skeleton } from "@shedflow/ui/components";

import { BookingChrome, BookingPageShell } from "@/components/booking/booking-shell";
import { eventColor } from "@/lib/event-colors";
import { publicScheduling } from "@/lib/scheduling";
import type { PublicEventType, PublicOrg } from "@/lib/types";

export function OrgEventList({
  orgSlug,
  embed,
  initialOrg,
  initialEvents,
}: {
  orgSlug: string;
  embed?: boolean;
  initialOrg?: PublicOrg | null;
  initialEvents?: PublicEventType[];
}) {
  const t = useTranslations("booking.org");
  const org = useQuery({
    queryKey: ["public-org", orgSlug],
    queryFn: () => publicScheduling.org(orgSlug),
    retry: false,
    initialData: initialOrg ? { data: initialOrg, source: "api" as const } : undefined,
  });
  const events = useQuery({
    queryKey: ["public-events", orgSlug],
    queryFn: () => publicScheduling.eventTypes(orgSlug),
    retry: false,
    initialData: initialEvents
      ? { data: initialEvents, source: "api" as const }
      : undefined,
  });

  if ((org.isLoading && !org.data) || (events.isLoading && !events.data)) {
    return (
      <BookingPageShell embed={embed}>
        <div className="mx-auto grid max-w-xl gap-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      </BookingPageShell>
    );
  }

  if (org.error && !org.data) {
    return (
      <BookingPageShell embed={embed}>
        <Alert variant="destructive" className="mx-auto max-w-lg">
          <AlertTitle>{t("notFoundTitle")}</AlertTitle>
          <AlertDescription>
            {org.error instanceof Error ? org.error.message : t("notFoundFallback")}
          </AlertDescription>
        </Alert>
      </BookingPageShell>
    );
  }

  const organization = org.data?.data;
  const items = events.data?.data ?? [];

  return (
    <BookingPageShell
      brandColor={organization?.brandColor}
      locale={organization?.locale}
      embed={embed}
    >
      <BookingChrome
        orgName={organization?.name ?? orgSlug}
        orgSlug={orgSlug}
        hideBadge={organization?.hideSchedflowBadge}
        embed={embed}
        showBack={false}
      />
      <div className="mx-auto w-full max-w-xl">
        <div className="mb-8 text-center">
          {organization?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={organization.logoUrl}
              alt=""
              className="mx-auto mb-4 size-14 rounded-full object-cover"
            />
          ) : null}
          <h1 className="text-2xl font-semibold">{organization?.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("welcome")}</p>
        </div>
        <div className="space-y-3">
          {items.length === 0 ? (
            <p className="rounded-xl border bg-background p-8 text-center text-sm text-muted-foreground">
              {t("empty")}
            </p>
          ) : (
            items.map((eventType) => (
              <Link
                key={eventType.slug}
                href={`/${orgSlug}/${eventType.slug}${embed ? "?embed=1" : ""}`}
                className="flex items-start overflow-hidden rounded-xl border bg-background shadow-sm transition hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span
                  className="w-1.5 self-stretch"
                  style={{ backgroundColor: eventColor(eventType.slug, organization?.brandColor) }}
                />
                <span className="flex-1 p-5">
                  <span className="block font-semibold">{eventType.title}</span>
                  <span className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                    {t("durationMinutes", { count: eventType.durationMinutes })}
                  </span>
                </span>
              </Link>
            ))
          )}
        </div>
      </div>
    </BookingPageShell>
  );
}
