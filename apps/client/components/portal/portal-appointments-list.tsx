"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";

import { formatRelativeInZone } from "@/lib/portal/multi-business";
import { fetchCustomerBookings } from "@/lib/portal/customer-api";
import { usePortalBusiness } from "@/components/portal/portal-business-context";
import {
  PortalEmptyState,
  PortalErrorState,
  PortalSkeleton,
} from "@/components/portal/portal-states";

export function PortalAppointmentsList() {
  const t = useTranslations("portal.appointments");
  const { data: session } = useSession();
  const { activeBusiness } = usePortalBusiness();
  const [items, setItems] = useState<
    Awaited<ReturnType<typeof fetchCustomerBookings>>["items"]
  >([]);
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
        const page = await fetchCustomerBookings(customerOrgId);
        setItems(page.items ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("loadFailed"));
        setItems([]);
      }
    });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerOrgId]);

  return (
    <section className="space-y-4" aria-labelledby="portal-appointments-heading">
      <div>
        <h1 id="portal-appointments-heading" className="text-2xl font-semibold tracking-tight">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {isPending && items.length === 0 ? <PortalSkeleton rows={4} /> : null}
      {error ? <PortalErrorState message={error} onRetry={load} /> : null}

      {!isPending && !error && items.length === 0 ? (
        <PortalEmptyState title={t("emptyTitle")} description={t("emptyBody")} />
      ) : null}

      {items.length > 0 ? (
        <ul className="divide-y rounded-lg border" role="list">
          {items.map((row) => (
            <li key={row.uid}>
              <Link
                href={`/portal/appointments/${encodeURIComponent(row.uid)}`}
                className="flex min-h-11 flex-col gap-0.5 px-4 py-3 hover:bg-muted/50"
              >
                <span className="font-medium">
                  {row.title ?? row.eventType?.title ?? t("appointmentFallback")}
                </span>
                <span className="text-sm text-muted-foreground">
                  {formatRelativeInZone(row.startAt, row.timezone)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
