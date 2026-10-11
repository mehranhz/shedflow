"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

import {
  buildAppointmentHref,
  fetchAggregatedUpcoming,
  formatRelativeInZone,
  type AggregatedAppointment,
  type MultiBusinessSource,
  writePortalUiPrefs,
} from "@/lib/portal/multi-business";

/**
 * All-businesses home (T-080). Stub-backed until T-042/T-049 APIs exist.
 */
export function AllBusinessesHome() {
  const [source, setSource] = useState<MultiBusinessSource>("stub");
  const [items, setItems] = useState<AggregatedAppointment[]>([]);
  const [message, setMessage] = useState<string | undefined>();
  const [, startTransition] = useTransition();

  useEffect(() => {
    startTransition(() => {
      void fetchAggregatedUpcoming({ allowStub: true }).then((result) => {
        setSource(result.source);
        setItems(result.appointments);
        setMessage(result.message);
      });
    });
  }, []);

  return (
    <section className="space-y-4" aria-labelledby="all-biz-heading">
      <div>
        <h1 id="all-biz-heading" className="text-2xl font-semibold tracking-tight">
          All businesses
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upcoming appointments across every business you book with.
        </p>
      </div>

      {message ? (
        <p className="text-xs text-muted-foreground" role="note">
          {message} (source: {source})
        </p>
      ) : null}

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          <p>No upcoming appointments.</p>
          <p className="mt-2">
            Search a business by slug once invite-to-book lands, or book from a public link.
          </p>
        </div>
      ) : (
        <ul className="divide-y rounded-lg border" role="list">
          {items.map((item) => (
            <li key={`${item.organizationId}:${item.uid}`}>
              <Link
                href={buildAppointmentHref(item, (orgId) => {
                  writePortalUiPrefs({ lastActiveOrgId: orgId });
                })}
                className="flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => writePortalUiPrefs({ lastActiveOrgId: item.organizationId })}
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
      )}
    </section>
  );
}
