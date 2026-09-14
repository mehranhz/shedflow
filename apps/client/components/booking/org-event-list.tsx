"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle, Skeleton } from "@shedflow/ui/components";

import { publicScheduling } from "@/lib/scheduling";
import { eventColor } from "@/lib/event-colors";

export function OrgEventList({ orgSlug }: { orgSlug: string }) {
  const org = useQuery({
    queryKey: ["public-org", orgSlug],
    queryFn: () => publicScheduling.org(orgSlug),
    retry: false,
  });
  const events = useQuery({
    queryKey: ["public-events", orgSlug],
    queryFn: () => publicScheduling.eventTypes(orgSlug),
    retry: false,
  });

  if (org.isLoading || events.isLoading) {
    return (
      <div className="mx-auto grid max-w-xl gap-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  if (org.error) {
    return (
      <Alert variant="destructive" className="mx-auto max-w-lg">
        <AlertTitle>Workspace not found</AlertTitle>
        <AlertDescription>
          {org.error instanceof Error ? org.error.message : "Check the link and try again."}
        </AlertDescription>
      </Alert>
    );
  }

  const organization = org.data?.data;
  const items = events.data?.data ?? [];

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold">{organization?.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Welcome to my scheduling page. Please select a meeting.</p>
      </div>
      <div className="space-y-3">
        {items.length === 0 ? (
          <p className="rounded-xl border bg-background p-8 text-center text-sm text-muted-foreground">
            No public event types yet.
          </p>
        ) : (
          items.map((eventType) => (
            <Link
              key={eventType.slug}
              href={`/${orgSlug}/${eventType.slug}`}
              className="flex items-start overflow-hidden rounded-xl border bg-background shadow-sm transition hover:shadow-md"
            >
              <span
                className="w-1.5 self-stretch"
                style={{ backgroundColor: eventColor(eventType.slug, organization?.brandColor) }}
              />
              <span className="flex-1 p-5">
                <span className="block font-semibold">{eventType.title}</span>
                <span className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                  {eventType.durationMinutes} min
                </span>
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
