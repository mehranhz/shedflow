"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@shedflow/ui/components";

import { formatRelativeInZone } from "@/lib/portal/multi-business";
import { fetchCustomerHome, fetchCustomerMe, type CustomerBookingCard } from "@/lib/portal/customer-api";
import { usePortalBusiness } from "@/components/portal/portal-business-context";
import { PortalEmptyState, PortalErrorState, PortalSkeleton } from "@/components/portal/portal-states";

function primaryHref(item: CustomerBookingCard): { href: string; labelKey: "join" | "directions" } | null {
  if ((item.locationType === "GOOGLE_MEET" || item.locationType === "LINK") && item.locationValue) {
    return { href: item.locationValue, labelKey: "join" };
  }
  if (item.locationType === "IN_PERSON" && item.locationValue) {
    return {
      href: `https://maps.google.com/?q=${encodeURIComponent(item.locationValue)}`,
      labelKey: "directions",
    };
  }
  return null;
}

export function PortalHome() {
  const t = useTranslations("portal.home");
  const { data: session, status } = useSession();
  const { activeBusiness } = usePortalBusiness();
  const customerOrgId =
    activeBusiness?.organizationId ?? session?.customerOrgId ?? undefined;
  const businessName = activeBusiness?.name ?? t("businessFallback");

  const home = useQuery({
    queryKey: ["customer-home", customerOrgId],
    queryFn: () => fetchCustomerHome(customerOrgId!),
    enabled: Boolean(customerOrgId),
    refetchOnWindowFocus: true,
  });
  const profile = useQuery({
    queryKey: ["customer-me", customerOrgId ?? "session"],
    queryFn: () => fetchCustomerMe(customerOrgId),
    enabled: status === "authenticated",
  });
  const profileIncomplete = Boolean(
    profile.data &&
      (!profile.data.user.name?.trim() || !profile.data.user.phone?.trim()),
  );

  const loading = status === "loading" || (Boolean(customerOrgId) && home.isLoading);
  const next = home.data?.nextAppointment ?? null;
  const action = next ? primaryHref(next) : null;

  return (
    <section className="space-y-4" aria-labelledby="portal-home-heading">
      <div>
        <h1 id="portal-home-heading" className="text-2xl font-semibold tracking-tight">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {home.isError ? (
        <PortalErrorState
          message={home.error instanceof Error ? home.error.message : t("loadFailed")}
          onRetry={() => void home.refetch()}
        />
      ) : null}

      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>{t("nextTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <PortalSkeleton rows={1} /> : null}
            {!loading && !next ? (
              <div className="space-y-3">
                <PortalEmptyState
                  title={t("emptyTitle")}
                  description={t("emptyBody", { business: businessName })}
                />
                <Button asChild className="w-full">
                  <Link href="/portal/book">{t("bookCta", { business: businessName })}</Link>
                </Button>
              </div>
            ) : null}
            {!loading && next ? (
              <div className="space-y-3">
                <p className="text-lg font-medium">{next.title ?? t("appointmentFallback")}</p>
                <p className="text-sm text-muted-foreground">
                  {formatRelativeInZone(next.startAt, next.timezone)}
                </p>
                <div className="flex flex-wrap gap-2">
                  {action ? (
                    <Button asChild>
                      <a href={action.href} target="_blank" rel="noopener noreferrer">
                        {t(action.labelKey)}
                      </a>
                    </Button>
                  ) : null}
                  <Button variant="outline" asChild>
                    <Link href={`/portal/appointments/${encodeURIComponent(next.uid)}`}>
                      {t("manage")}
                    </Link>
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("actionsTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <PortalSkeleton rows={1} /> : null}
            {!loading && (home.data?.actionsNeeded.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">{t("actionsEmpty")}</p>
            ) : null}
            {!loading && home.data && home.data.actionsNeeded.length > 0 ? (
              <ul className="space-y-2">
                {home.data.actionsNeeded.map((item) => (
                  <li key={item.uid}>
                    <Link
                      href={`/portal/appointments/${encodeURIComponent(item.uid)}`}
                      className="flex min-h-11 items-center justify-between gap-2 rounded-md px-2 py-2 hover:bg-muted/50"
                    >
                      <span>{item.title ?? t("appointmentFallback")}</span>
                      <Badge variant="secondary">{item.status}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("receiptsTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? <PortalSkeleton rows={1} /> : null}
            {!loading ? (
              <>
                <p className="text-sm text-muted-foreground">
                  {t("receiptsCount", { count: home.data?.receiptsPendingCount ?? 0 })}
                </p>
                <Button variant="outline" asChild>
                  <Link href="/portal/payments">{t("receiptsLink")}</Link>
                </Button>
              </>
            ) : null}
          </CardContent>
        </Card>

        {profile.data ? (
          <Card>
            <CardHeader>
              <CardTitle>{profileIncomplete ? t("completeProfile") : t("editProfileHome")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {profileIncomplete ? t("completeProfileHint") : t("editProfileHomeHint")}
              </p>
              <Button asChild className="min-h-11 w-full">
                <Link href="/portal/account/profile">
                  {profileIncomplete ? t("completeProfile") : t("editProfileHome")}
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>{t("waitlistTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <PortalSkeleton rows={1} /> : null}
            {!loading && (home.data?.waitlistCount ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">{t("waitlistEmpty")}</p>
            ) : null}
            {!loading && (home.data?.waitlistCount ?? 0) > 0 ? (
              <p className="text-sm">{t("waitlistCount", { count: home.data?.waitlistCount ?? 0 })}</p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
