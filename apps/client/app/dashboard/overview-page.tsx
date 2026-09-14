"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { addDays } from "date-fns";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
} from "@shedflow/ui/components";
import { ArrowRight, CalendarDays, Check, Copy, Link2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { useOrg } from "@/components/org-provider";
import { APP_URL } from "@/lib/public-config";
import { schedulingApi } from "@/lib/scheduling";
import type { OnboardingFlags } from "@/lib/types";

export function OverviewPage() {
  const { organization, profile } = useOrg();
  const events = useQuery({
    queryKey: ["event-types", organization.id],
    queryFn: () => schedulingApi.listEventTypes(organization, profile.id),
  });
  const bookings = useQuery({
    queryKey: ["bookings", organization.id],
    queryFn: () => schedulingApi.listBookings(organization, profile.id),
  });

  const flags = (organization.settings.onboarding ?? {}) as OnboardingFlags;
  const eventCount = events.data?.data.length ?? 0;
  const upcoming = (bookings.data?.data.items ?? []).filter((booking) => {
    const start = new Date(booking.startAt);
    return start >= new Date() && (booking.status === "CONFIRMED" || booking.status === "PENDING_CONFIRMATION");
  });
  const week = upcoming.filter((booking) => new Date(booking.startAt) < addDays(new Date(), 7));
  const today = upcoming.filter((booking) => {
    const start = new Date(booking.startAt);
    const now = new Date();
    return start.toDateString() === now.toDateString();
  });
  const firstEvent = events.data?.data[0];

  const steps = [
    { key: "orgProfile", label: "Set workspace name and time zone", done: Boolean(organization.name), href: "/dashboard/settings" },
    { key: "availability", label: "Set your working hours", done: Boolean(flags.availability) || eventCount > 0, href: "/dashboard/availability" },
    { key: "eventType", label: "Create an event type", done: eventCount > 0, href: "/dashboard/event-types/new" },
    { key: "copyLink", label: "Copy your booking link", done: Boolean(flags.copyLink), href: "/dashboard/event-types" },
    { key: "calendar", label: "Connect Google Calendar", done: Boolean(flags.calendar), href: "/dashboard/settings" },
    { key: "stripe", label: "Connect Stripe (Pro)", done: Boolean(flags.stripe) || organization.platformPlan === "PRO", href: "/dashboard/billing" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Home"
        description={`Welcome back. Here’s what’s happening in ${organization.name}.`}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Today</CardDescription>
            <CardTitle className="text-3xl">{today.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Next 7 days</CardDescription>
            <CardTitle className="text-3xl">{week.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Event types</CardDescription>
            <CardTitle className="text-3xl">{eventCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {eventCount === 0 ? (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle>Finish setting up your booking page</CardTitle>
            <CardDescription>
              Create an event type, copy the link, and you’re ready to take meetings.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {steps.map((step) => (
              <Link
                key={step.key}
                href={step.href}
                className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2 text-sm hover:bg-muted/50"
              >
                <Checkbox checked={step.done} disabled className="pointer-events-none" />
                <span className="flex-1">{step.label}</span>
                {step.done ? (
                  <Check className="size-4 text-emerald-600" />
                ) : (
                  <ArrowRight className="size-4 text-muted-foreground" />
                )}
              </Link>
            ))}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Share your link</CardTitle>
              <CardDescription>Send this to invitees or add it to your site.</CardDescription>
            </div>
            <Button
              variant="outline"
              onClick={async () => {
                const url = firstEvent
                  ? `${APP_URL}/${organization.slug}/${firstEvent.slug}`
                  : `${APP_URL}/${organization.slug}`;
                await navigator.clipboard.writeText(url);
                toast.success("Copied");
              }}
            >
              <Copy className="size-4" />
              Copy link
            </Button>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm">
              <Link2 className="size-4 text-muted-foreground" />
              <span className="truncate">
                {APP_URL}/{organization.slug}
                {firstEvent ? `/${firstEvent.slug}` : ""}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Upcoming meetings</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard/bookings">View all</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center">
              <CalendarDays className="mb-3 size-10 text-muted-foreground" />
              <p className="font-medium">No upcoming meetings</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Share an event type to start filling your calendar.
              </p>
              <Button className="mt-4" asChild>
                <Link href="/dashboard/event-types">Go to event types</Link>
              </Button>
            </div>
          ) : (
            <ul className="divide-y">
              {upcoming.slice(0, 6).map((booking) => (
                <li key={booking.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium">
                      {booking.eventType?.title ?? "Meeting"} with{" "}
                      {booking.customer?.name ?? "invitee"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(booking.startAt).toLocaleString()}
                    </p>
                  </div>
                  <StatusBadge status={booking.status} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
