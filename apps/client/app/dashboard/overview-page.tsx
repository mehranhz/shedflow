"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("dashboard.overview");
  const tc = useTranslations("dashboard.common");
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
    { key: "orgProfile" as const, done: Boolean(organization.name), href: "/dashboard/settings" },
    { key: "availability" as const, done: Boolean(flags.availability) || eventCount > 0, href: "/dashboard/availability" },
    { key: "eventType" as const, done: eventCount > 0, href: "/dashboard/event-types/new" },
    { key: "copyLink" as const, done: Boolean(flags.copyLink), href: "/dashboard/event-types" },
    { key: "calendar" as const, done: Boolean(flags.calendar), href: "/dashboard/settings" },
    { key: "stripe" as const, done: Boolean(flags.stripe) || organization.platformPlan === "PRO", href: "/dashboard/billing" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("welcome", { orgName: organization.name })}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>{t("today")}</CardDescription>
            <CardTitle className="text-3xl">{today.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t("next7")}</CardDescription>
            <CardTitle className="text-3xl">{week.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t("eventTypes")}</CardDescription>
            <CardTitle className="text-3xl">{eventCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {eventCount === 0 ? (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle>{t("setupTitle")}</CardTitle>
            <CardDescription>{t("setupBody")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {steps.map((step) => (
              <Link
                key={step.key}
                href={step.href}
                className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2 text-sm hover:bg-muted/50"
              >
                <Checkbox checked={step.done} disabled className="pointer-events-none" />
                <span className="flex-1">{t(`steps.${step.key}`)}</span>
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
              <CardTitle className="text-base">{t("shareTitle")}</CardTitle>
              <CardDescription>{t("shareBody")}</CardDescription>
            </div>
            <Button
              variant="outline"
              onClick={async () => {
                const url = firstEvent
                  ? `${APP_URL}/${organization.slug}/${firstEvent.slug}`
                  : `${APP_URL}/${organization.slug}`;
                await navigator.clipboard.writeText(url);
                toast.success(tc("copied"));
              }}
            >
              <Copy className="size-4" />
              {tc("copyLink")}
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
          <CardTitle className="text-base">{t("upcomingTitle")}</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard/bookings">{tc("viewAll")}</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center">
              <CalendarDays className="mb-3 size-10 text-muted-foreground" />
              <p className="font-medium">{t("emptyTitle")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("emptyBody")}</p>
              <Button className="mt-4" asChild>
                <Link href="/dashboard/event-types">{t("goEventTypes")}</Link>
              </Button>
            </div>
          ) : (
            <ul className="divide-y">
              {upcoming.slice(0, 6).map((booking) => (
                <li key={booking.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium">
                      {t("withInvitee", {
                        title: booking.eventType?.title ?? tc("meeting"),
                        name: booking.customer?.name ?? tc("invitee"),
                      })}
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
