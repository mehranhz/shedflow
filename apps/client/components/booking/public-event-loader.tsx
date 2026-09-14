"use client";

import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle, Skeleton } from "@shedflow/ui/components";

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
  fallbackOrg: PublicOrg;
  fallbackEvent: PublicEventType;
  embed: boolean;
}) {
  const query = useQuery({
    queryKey: ["public-event", orgSlug, eventSlug],
    queryFn: () => publicScheduling.eventType(orgSlug, eventSlug),
    retry: false,
  });

  if (query.isLoading) {
    return <Skeleton className="mx-auto h-[520px] w-full max-w-4xl rounded-2xl" />;
  }

  if (query.error && !query.data) {
    return (
      <div className="mx-auto max-w-lg">
        <Alert variant="destructive">
          <AlertTitle>This page isn’t available</AlertTitle>
          <AlertDescription>
            {query.error instanceof Error
              ? query.error.message
              : "We couldn’t find that event type. Create it in your dashboard, then open this link in the same browser if the scheduling API isn’t running yet."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const eventType = query.data?.data ?? fallbackEvent;
  const organization = query.data?.data.organization ?? fallbackOrg;

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
