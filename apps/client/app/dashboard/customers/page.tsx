"use client";

import Link from "next/link";
import { useMemo, useState, type ChangeEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@shedflow/ui/components";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { QueryError, TableSkeleton } from "@/components/query-state";
import { useOrg } from "@/components/org-provider";
import { schedulingApi } from "@/lib/scheduling";

export default function CustomersPage() {
  const t = useTranslations("dashboard.customers");
  const { organization, profile } = useOrg();
  const [search, setSearch] = useState("");

  const query = useQuery({
    queryKey: ["customers", organization.id],
    queryFn: () => schedulingApi.listCustomers(organization, profile.id),
  });

  const bookings = useQuery({
    queryKey: ["bookings", organization.id],
    queryFn: () => schedulingApi.listBookings(organization, profile.id),
  });

  const bookingCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const booking of bookings.data?.data.items ?? []) {
      counts.set(booking.customerId, (counts.get(booking.customerId) ?? 0) + 1);
    }
    return counts;
  }, [bookings.data]);

  const items = useMemo(() => {
    const list = query.data?.data.items ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (customer) =>
        customer.name.toLowerCase().includes(q) ||
        customer.email.toLowerCase().includes(q) ||
        (customer.phone ?? "").toLowerCase().includes(q),
    );
  }, [query.data, search]);

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} />

      <Input
        id="customers-search"
        value={search}
        onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)}
        placeholder={t("search")}
        aria-label={t("search")}
        className="max-w-md"
      />

      {query.isLoading ? <TableSkeleton /> : null}
      {query.error ? (
        <QueryError
          message={
            query.error instanceof Error ? query.error.message : t("loadFailed")
          }
          onRetry={() => void query.refetch()}
        />
      ) : null}

      {query.data && items.length === 0 ? (
        <EmptyState
          title={search ? t("emptySearch") : t("emptyTitle")}
          description={search ? t("emptySearchBody") : t("emptyBody")}
        />
      ) : null}

      {items.length > 0 ? (
        <div className="overflow-hidden rounded-xl border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colName")}</TableHead>
                <TableHead>{t("colEmail")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("colPhone")}</TableHead>
                <TableHead className="hidden sm:table-cell">{t("colBookings")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell className="font-medium">
                    <Link
                      className="hover:text-primary"
                      href={`/dashboard/customers/${customer.id}`}
                    >
                      {customer.name}
                    </Link>
                  </TableCell>
                  <TableCell>{customer.email}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    {customer.phone ?? "—"}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {bookingCounts.get(customer.id) ?? 0}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {query.data?.source === "preview" ? (
        <p className="text-xs text-muted-foreground">{t("previewNote")}</p>
      ) : null}
    </div>
  );
}
