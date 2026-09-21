"use client";

import Link from "next/link";
import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@shedflow/ui/components";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { QueryError, TableSkeleton } from "@/components/query-state";
import { StatusBadge } from "@/components/status-badge";
import { useOrg } from "@/components/org-provider";
import { schedulingApi } from "@/lib/scheduling";

export default function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations("dashboard.customers");
  const tc = useTranslations("dashboard.common");
  const { organization, profile } = useOrg();

  const customers = useQuery({
    queryKey: ["customers", organization.id],
    queryFn: () => schedulingApi.listCustomers(organization, profile.id),
  });

  const bookings = useQuery({
    queryKey: ["bookings", organization.id],
    queryFn: () => schedulingApi.listBookings(organization, profile.id),
    refetchInterval: 30_000,
  });

  const customer = customers.data?.data.items.find((item) => item.id === id);
  const history = (bookings.data?.data.items ?? [])
    .filter((booking) => booking.customerId === id)
    .sort((a, b) => b.startAt.localeCompare(a.startAt));

  if (customers.isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("detailTitle")} description={t("loading")} />
        <TableSkeleton />
      </div>
    );
  }

  if (customers.error) {
    return (
      <QueryError
        message={
          customers.error instanceof Error
            ? customers.error.message
            : t("loadFailed")
        }
        onRetry={() => void customers.refetch()}
      />
    );
  }

  if (!customer) {
    return (
      <div className="space-y-4">
        <PageHeader title={t("notFound")} />
        <Button variant="outline" asChild>
          <Link href="/dashboard/customers">
            <ArrowLeft className="size-4" />
            {t("backToList")}
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader title={customer.name} description={customer.email} />
        <Button variant="outline" asChild>
          <Link href="/dashboard/customers">
            <ArrowLeft className="size-4" />
            {t("back")}
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("profile")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">{t("emailLabel")}</span>{" "}
              {customer.email}
            </p>
            <p>
              <span className="text-muted-foreground">{t("phoneLabel")}</span>{" "}
              {customer.phone ?? "—"}
            </p>
            <p>
              <span className="text-muted-foreground">{t("timezoneLabel")}</span>{" "}
              {customer.timezone ?? "—"}
            </p>
            {customer.notes ? (
              <p>
                <span className="text-muted-foreground">{t("notesLabel")}</span>{" "}
                {customer.notes}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("creditsTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {t("creditsBody")}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("historyTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noHistory")}</p>
          ) : (
            history.map((booking) => (
              <div
                key={booking.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <p className="font-medium">
                    {booking.eventType?.title ?? tc("meeting")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(booking.startAt).toLocaleString()}
                  </p>
                </div>
                <StatusBadge status={booking.status} />
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
