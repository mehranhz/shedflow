"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";

import {
  buildAppointmentHref,
  formatRelativeInZone,
  type AggregatedAppointment,
} from "@/lib/portal/multi-business";
import { fetchCustomerBookings } from "@/lib/portal/customer-api";
import { usePortalBusiness } from "@/components/portal/portal-business-context";
import {
  PortalEmptyState,
  PortalErrorState,
  PortalSkeleton,
} from "@/components/portal/portal-states";

export function PortalHome() {
  const t = useTranslations("portal.home");
  const { data: session } = useSession();
  const { activeBusiness } = usePortalBusiness();
  const [items, setItems] = useState<AggregatedAppointment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const customerOrgId =
    activeBusiness?.organizationId ?? session?.customerOrgId ?? undefined;

  const load = () => {
    if (!customerOrgId) {
      setItems([]);
      return;
    }
    startTransition(async () => {
      setError(null);
      try {
        const page = await fetchCustomerBookings(customerOrgId, {
          status: "CONFIRMED",
          upcoming: "1",
        });
        const mapped: AggregatedAppointment[] = (page.items ?? []).map((row) => ({
          uid: row.uid,
          organizationId: row.organization?.id ?? customerOrgId,
          organizationSlug: row.organization?.slug ?? "org",
          organizationName: row.organization?.name ?? activeBusiness?.name ?? t("businessFallback"),
          brandColor: row.organization?.brandColor ?? activeBusiness?.brandColor ?? null,
          startAt: row.startAt,
          timezone: row.timezone,
          title: row.title ?? row.eventType?.title ?? t("appointmentFallback"),
          status: row.status,
        }));
        mapped.sort((a, b) => a.startAt.localeCompare(b.startAt));
        setItems(mapped);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("loadFailed"));
        setItems([]);
      }
    });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when active business changes
  }, [customerOrgId]);

  return (
    <section className="space-y-4" aria-labelledby="portal-home-heading">
      <div>
        <h1 id="portal-home-heading" className="text-2xl font-semibold tracking-tight">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {isPending && items.length === 0 ? <PortalSkeleton rows={3} /> : null}

      {error ? <PortalErrorState message={error} onRetry={load} /> : null}

      {!isPending && !error && items.length === 0 ? (
        <PortalEmptyState title={t("emptyTitle")} description={t("emptyBody")} />
      ) : null}

      {items.length > 0 ? (
        <ul className="divide-y rounded-lg border" role="list">
          {items.map((item) => (
            <li key={`${item.organizationId}:${item.uid}`}>
              <Link
                href={buildAppointmentHref(item)}
                className="flex min-h-11 flex-col gap-1 px-4 py-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: item.brandColor ?? "#64748b" }}
                    aria-hidden
                  />
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {item.organizationName}
                  </span>
                </div>
                <span className="font-medium">{item.title}</span>
                <span className="text-sm text-muted-foreground">
                  {formatRelativeInZone(item.startAt, item.timezone)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
