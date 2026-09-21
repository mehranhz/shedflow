"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@shedflow/ui/components";

import { BookingDetailSheet } from "@/components/dashboard/booking-detail-sheet";
import { CreateBookingDialog } from "@/components/dashboard/create-booking-dialog";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { QueryError, TableSkeleton } from "@/components/query-state";
import { StatusBadge } from "@/components/status-badge";
import { useOrg } from "@/components/org-provider";
import { schedulingApi } from "@/lib/scheduling";
import type { Booking, BookingStatus } from "@/lib/types";

export default function BookingsPage() {
  const t = useTranslations("dashboard.bookings");
  const tc = useTranslations("dashboard.common");
  const { organization, profile } = useOrg();
  const [range, setRange] = useState("upcoming");
  const [status, setStatus] = useState("all");
  const [eventTypeId, setEventTypeId] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selected, setSelected] = useState<Booking | null>(null);

  const STATUS_FILTERS = [
    { value: "all", label: t("statuses.all") },
    { value: "CONFIRMED", label: t("statuses.CONFIRMED") },
    { value: "PENDING_CONFIRMATION", label: t("statuses.PENDING_CONFIRMATION") },
    { value: "PENDING_PAYMENT", label: t("statuses.PENDING_PAYMENT") },
    { value: "CANCELLED", label: t("statuses.CANCELLED") },
    { value: "NO_SHOW", label: t("statuses.NO_SHOW") },
  ];

  const RANGE_FILTERS = [
    { value: "upcoming", label: t("ranges.upcoming") },
    { value: "past", label: t("ranges.past") },
    { value: "all", label: t("ranges.all") },
  ];

  const events = useQuery({
    queryKey: ["event-types", organization.id],
    queryFn: () => schedulingApi.listEventTypes(organization, profile.id),
  });

  const query = useQuery({
    queryKey: [
      "bookings",
      organization.id,
      status,
      eventTypeId,
      fromDate,
      toDate,
    ],
    queryFn: () =>
      schedulingApi.listBookings(organization, profile.id, {
        status: status === "all" ? undefined : status,
        eventTypeId: eventTypeId === "all" ? undefined : eventTypeId,
        from: fromDate ? new Date(`${fromDate}T00:00:00`).toISOString() : undefined,
        to: toDate ? new Date(`${toDate}T23:59:59`).toISOString() : undefined,
      }),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const items = useMemo(() => {
    const list = query.data?.data.items ?? [];
    const now = Date.now();
    return list.filter((booking) => {
      const start = new Date(booking.startAt).getTime();
      if (range === "upcoming") {
        return start >= now;
      }
      if (range === "past") {
        return start < now;
      }
      return true;
    });
  }, [query.data, range]);

  useEffect(() => {
    if (!selected) return;
    const fresh = (query.data?.data.items ?? []).find((item) => item.id === selected.id);
    if (fresh && fresh.updatedAt !== selected.updatedAt) {
      setSelected(fresh);
    }
  }, [query.data, selected]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={<CreateBookingDialog />}
      />

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {RANGE_FILTERS.map((item) => (
            <Button
              key={item.value}
              size="sm"
              variant={range === item.value ? "default" : "outline"}
              onClick={() => setRange(item.value)}
            >
              {item.label}
            </Button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue placeholder={t("colStatus")} />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={eventTypeId} onValueChange={setEventTypeId}>
            <SelectTrigger>
              <SelectValue placeholder={t("colEvent")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allEventTypes")}</SelectItem>
              {(events.data?.data ?? []).map((event) => (
                <SelectItem key={event.id} value={event.id}>
                  {event.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={fromDate}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setFromDate(event.target.value)
            }
            aria-label={t("fromDate")}
          />
          <Input
            type="date"
            value={toDate}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setToDate(event.target.value)
            }
            aria-label={t("toDate")}
          />
        </div>
      </div>

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
          title={t("emptyTitle")}
          description={t("emptyBody")}
          actionHref="/dashboard/event-types"
          actionLabel={t("emptyAction")}
        />
      ) : null}

      {items.length > 0 ? (
        <div className="overflow-hidden rounded-xl border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colInvitee")}</TableHead>
                <TableHead>{t("colEvent")}</TableHead>
                <TableHead>{t("colTime")}</TableHead>
                <TableHead>{t("colStatus")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((booking) => (
                <TableRow
                  key={booking.id}
                  className="cursor-pointer"
                  onClick={() => setSelected(booking)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelected(booking);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                >
                  <TableCell className="font-medium">
                    {booking.customer?.name ?? tc("invitee")}
                    <div className="text-xs text-muted-foreground">
                      {booking.customer?.email}
                    </div>
                  </TableCell>
                  <TableCell>{booking.eventType?.title ?? tc("meeting")}</TableCell>
                  <TableCell>
                    {new Date(booking.startAt).toLocaleString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={booking.status as BookingStatus} />
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

      <BookingDetailSheet
        booking={selected}
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        onUpdated={(next) => setSelected(next)}
      />
    </div>
  );
}
