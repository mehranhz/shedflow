"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import {
  Badge,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@shedflow/ui/components";

import { formatRelativeInZone } from "@/lib/portal/multi-business";
import { fetchCustomerBookings } from "@/lib/portal/customer-api";
import { usePortalBusiness } from "@/components/portal/portal-business-context";
import { PortalEmptyState, PortalErrorState, PortalSkeleton } from "@/components/portal/portal-states";

const TABS = ["upcoming", "past", "cancelled"] as const;

export function PortalAppointmentsList() {
  const t = useTranslations("portal.appointments");
  const { data: session } = useSession();
  const { activeBusiness, businesses, switchBusiness, loading: businessLoading } = usePortalBusiness();
  const [tab, setTab] = useState<(typeof TABS)[number]>("upcoming");
  const [q, setQ] = useState("");
  const customerOrgId =
    activeBusiness?.organizationId ?? session?.customerOrgId ?? undefined;

  const list = useQuery({
    queryKey: ["customer-bookings", customerOrgId, tab, q],
    queryFn: () =>
      fetchCustomerBookings(customerOrgId!, {
        tab,
        ...(q.trim() ? { q: q.trim() } : {}),
      }),
    enabled: Boolean(customerOrgId),
  });

  return (
    <section className="space-y-4" aria-labelledby="portal-appointments-heading">
      <div>
        <h1 id="portal-appointments-heading" className="text-2xl font-semibold tracking-tight">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {businesses.length > 1 ? (
        <div className="grid gap-2">
          <Label htmlFor="appointment-business">{t("businessFilter")}</Label>
          <Select
            value={activeBusiness?.organizationId}
            onValueChange={(value) => void switchBusiness(value)}
            disabled={businessLoading}
          >
            <SelectTrigger id="appointment-business" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {businesses.map((business) => (
                <SelectItem key={business.organizationId} value={business.organizationId}>
                  {business.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor="appointment-search">{t("search")}</Label>
        <Input
          id="appointment-search"
          value={q}
          placeholder={t("searchPlaceholder")}
          onChange={(event) => setQ(event.target.value)}
        />
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as (typeof TABS)[number])}>
        <TabsList>
          {TABS.map((key) => (
            <TabsTrigger key={key} value={key}>
              {t(key)}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((key) => (
          <TabsContent key={key} value={key} className="mt-4">
            {list.isLoading ? <PortalSkeleton rows={4} /> : null}
            {list.isError ? (
              <PortalErrorState
                message={list.error instanceof Error ? list.error.message : t("loadFailed")}
                onRetry={() => void list.refetch()}
              />
            ) : null}
            {!list.isLoading && !list.isError && (list.data?.items.length ?? 0) === 0 ? (
              <PortalEmptyState title={t("emptyTitle")} description={t("emptyBody")} />
            ) : null}
            {list.data && list.data.items.length > 0 ? (
              <ul className="divide-y rounded-lg border" role="list">
                {list.data.items.map((row) => (
                  <li key={row.uid}>
                    <Link
                      href={`/portal/appointments/${encodeURIComponent(row.uid)}`}
                      className="flex min-h-11 flex-col gap-1 px-4 py-3 hover:bg-muted/50"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-medium">
                          {row.title ?? row.eventType?.title ?? t("appointmentFallback")}
                        </span>
                        <Badge variant="secondary">{row.status}</Badge>
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {formatRelativeInZone(row.startAt, row.timezone)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}
