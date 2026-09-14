"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Card,
  CardContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@shedflow/ui/components";
import { Copy, ExternalLink, MoreHorizontal, Settings } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { useOrg } from "@/components/org-provider";
import { CardGridSkeleton, QueryError } from "@/components/query-state";
import { APP_URL } from "@/lib/public-config";
import { eventColor } from "@/lib/event-colors";
import { schedulingApi } from "@/lib/scheduling";
import type { EventType } from "@/lib/types";

function locationLabel(eventType: EventType): string {
  switch (eventType.locationType) {
    case "GOOGLE_MEET":
      return "Google Meet";
    case "PHONE":
      return "Phone call";
    case "IN_PERSON":
      return eventType.locationValue || "In-person";
    case "LINK":
      return eventType.locationValue || "Link";
    default:
      return eventType.locationValue || "Custom";
  }
}

export function EventTypesList() {
  const { organization, profile } = useOrg();
  const query = useQuery({
    queryKey: ["event-types", organization.id],
    queryFn: () => schedulingApi.listEventTypes(organization, profile.id),
  });

  const grouped = query.data?.data ?? [];

  const copyLink = async (eventType: EventType) => {
    const url = `${APP_URL}/${organization.slug}/${eventType.slug}`;
    await navigator.clipboard.writeText(url);
    toast.success("Booking link copied");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Event types"
        description="Create events to share for people to book on your calendar."
        actions={
          <Button asChild>
            <Link href="/dashboard/event-types/new">+ New event type</Link>
          </Button>
        }
      />

      {query.isLoading ? <CardGridSkeleton /> : null}
      {query.error ? (
        <QueryError
          message={query.error instanceof Error ? query.error.message : "Could not load event types"}
          onRetry={() => void query.refetch()}
        />
      ) : null}

      {query.data && grouped.length === 0 ? (
        <EmptyState
          title="Create your first event type"
          description="Event types are the meeting templates invitees book — like a 30-minute intro call."
          actionHref="/dashboard/event-types/new"
          actionLabel="New event type"
        />
      ) : null}

      {grouped.length > 0 ? (
        <div>
          <div className="mb-3 flex items-center gap-2 text-sm">
            <span className="font-medium">{organization.name}</span>
            <span className="text-muted-foreground">/ {organization.slug}</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {grouped.map((eventType) => {
              const color = eventColor(eventType.id, organization.brandColor);
              return (
                <Card
                  key={eventType.id}
                  className="overflow-hidden border-0 py-0 shadow-sm ring-1 ring-border/80"
                >
                  <div className="h-2" style={{ backgroundColor: color }} />
                  <CardContent className="space-y-4 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/dashboard/event-types/${eventType.id}`}
                          className="font-semibold hover:text-primary"
                        >
                          {eventType.title}
                        </Link>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {eventType.durationMinutes} mins, one-on-one
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {locationLabel(eventType)}
                        </p>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8">
                            <MoreHorizontal className="size-4" />
                            <span className="sr-only">Open menu</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/dashboard/event-types/${eventType.id}`}>
                              Edit
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => void copyLink(eventType)}>
                            Copy link
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link
                              href={`/${organization.slug}/${eventType.slug}`}
                              target="_blank"
                            >
                              View booking page
                            </Link>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="flex items-center justify-between border-t pt-3">
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void copyLink(eventType)}
                        >
                          <Copy className="size-3.5" />
                          Copy link
                        </Button>
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/dashboard/event-types/${eventType.id}`}>
                            <Settings className="size-3.5" />
                            Edit
                          </Link>
                        </Button>
                      </div>
                      <Button variant="ghost" size="icon" className="size-8" asChild>
                        <Link
                          href={`/${organization.slug}/${eventType.slug}`}
                          target="_blank"
                          aria-label="Open public page"
                        >
                          <ExternalLink className="size-4" />
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ) : null}
      {query.data?.source === "preview" ? (
        <p className="text-xs text-muted-foreground">
          Scheduling API is not online yet, so event types are saved in this browser for preview.
        </p>
      ) : null}
    </div>
  );
}
