"use client";

/**
 * Staff complementary CRM panel (T-079).
 *
 * Feature-detects Wave 14/15 portal APIs. Renders empty states when dependents,
 * waitlist, messaging, forms, etc. are not yet available — avoids fighting
 * unmerged schema from sibling waves.
 */

import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@shedflow/ui/components";

type PortalCrmSnapshot = {
  portalUserLinked: boolean | null;
  dependents: unknown[] | null;
  favorites: unknown[] | null;
  waitlist: unknown[] | null;
  formSubmissions: unknown[] | null;
  openThreads: unknown[] | null;
  creditBalance: { minor: number; currency: string } | null;
};

async function probePortalCrm(
  orgId: string,
  customerId: string,
  accessToken?: string,
): Promise<PortalCrmSnapshot> {
  const headers: HeadersInit = {
    Accept: "application/json",
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };

  async function getJson(path: string): Promise<unknown | null> {
    try {
      const res = await fetch(path, { headers, cache: "no-store" });
      if (res.status === 404 || res.status === 501) return null;
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  }

  const base = `/api/bff/api/organizations/${orgId}/customers/${customerId}`;
  const [exportBody, dependents, waitlist, threads, favorites, forms] =
    await Promise.all([
      getJson(`${base}/export`),
      getJson(`${base}/dependents`),
      getJson(`${base}/waitlist`),
      getJson(`${base}/message-threads`),
      getJson(`${base}/favorites`),
      getJson(`${base}/form-submissions`),
    ]);

  const linked =
    exportBody &&
    typeof exportBody === "object" &&
    "customer" in exportBody &&
    (exportBody as { customer?: { userId?: string | null } }).customer?.userId !=
      null
      ? true
      : exportBody
        ? false
        : null;

  return {
    portalUserLinked: linked,
    dependents: Array.isArray(dependents) ? dependents : null,
    favorites: Array.isArray(favorites) ? favorites : null,
    waitlist: Array.isArray(waitlist) ? waitlist : null,
    formSubmissions: Array.isArray(forms) ? forms : null,
    openThreads: Array.isArray(threads) ? threads : null,
    creditBalance: null,
  };
}

function EmptyHint({ label }: { label: string }) {
  return (
    <p className="text-sm text-muted-foreground">
      {label} — not available yet (portal engagement APIs pending).
    </p>
  );
}

export function PortalCrmComplements({
  organizationId,
  customerId,
  accessToken,
}: {
  organizationId: string;
  customerId: string;
  accessToken?: string;
}) {
  const query = useQuery({
    queryKey: ["portal-crm", organizationId, customerId],
    queryFn: () => probePortalCrm(organizationId, customerId, accessToken),
    staleTime: 30_000,
  });

  const data = query.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Portal CRM</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {query.isLoading ? (
          <p className="text-muted-foreground">Checking portal links…</p>
        ) : (
          <>
            <p>
              <span className="text-muted-foreground">Portal user: </span>
              {data?.portalUserLinked === true
                ? "Linked"
                : data?.portalUserLinked === false
                  ? "Guest / unlinked"
                  : "Unknown (export probe unavailable)"}
            </p>
            {data?.dependents ? (
              <p>Dependents: {data.dependents.length}</p>
            ) : (
              <EmptyHint label="Dependents" />
            )}
            {data?.favorites ? (
              <p>Favorites: {data.favorites.length}</p>
            ) : (
              <EmptyHint label="Favorites" />
            )}
            {data?.waitlist ? (
              <p>Waitlist entries: {data.waitlist.length}</p>
            ) : (
              <EmptyHint label="Waitlist" />
            )}
            {data?.formSubmissions ? (
              <p>Form submissions: {data.formSubmissions.length}</p>
            ) : (
              <EmptyHint label="Form submissions" />
            )}
            {data?.openThreads ? (
              <div className="space-y-2">
                <p>Open message threads: {data.openThreads.length}</p>
                <p className="text-xs text-muted-foreground">
                  Reply UI activates when T-069 messaging APIs are present. MEMBER
                  access is limited to own-host bookings (document in staff RBAC).
                </p>
              </div>
            ) : (
              <EmptyHint label="Message threads" />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
