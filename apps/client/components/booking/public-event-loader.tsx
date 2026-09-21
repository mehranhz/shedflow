"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription, AlertTitle, Button, Skeleton } from "@shedflow/ui/components";

import { SlotPicker } from "@/components/booking/slot-picker";
import { publicScheduling } from "@/lib/scheduling";
import type { PublicEventType, PublicOrg } from "@/lib/types";

export function PublicEventLoader({
  orgSlug,
  eventSlug,
  fallbackOrg,
  fallbackEvent,
  embed,
}: {
  orgSlug: string;
  eventSlug: string;
  fallbackOrg?: PublicOrg | null;
  fallbackEvent?: PublicEventType | null;
  embed: boolean;
}) {
  const t = useTranslations("booking.event");
  const query = useQuery({
    queryKey: ["public-event", orgSlug, eventSlug],
    queryFn: () => publicScheduling.eventType(orgSlug, eventSlug),
    retry: false,
    initialData:
      fallbackEvent && fallbackOrg
        ? {
            data: { ...fallbackEvent, organization: fallbackOrg },
            source: "api" as const,
          }
        : undefined,
  });

  if (query.isLoading && !query.data) {
    return <Skeleton className="mx-auto h-[520px] w-full max-w-4xl rounded-2xl" />;
  }

  if ((query.error && !query.data) || !query.data) {
    return (
      <div className="mx-auto max-w-lg">
        <Alert variant="destructive">
          <AlertTitle>{t("unavailableTitle")}</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              {query.error instanceof Error ? query.error.message : t("notFoundFallback")}
            </p>
            <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
              {t("retry")}
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const eventType = query.data.data;
  const organization = eventType.organization ?? fallbackOrg;

  if (!organization) {
    return (
      <Alert variant="destructive" className="mx-auto max-w-lg">
        <AlertTitle>{t("unavailableTitle")}</AlertTitle>
        <AlertDescription>{t("missingOrg")}</AlertDescription>
      </Alert>
    );
  }

  return (
    <SlotPicker
      orgSlug={orgSlug}
      eventSlug={eventSlug}
      eventType={eventType}
      organization={organization}
      embed={embed}
    />
  );
}
