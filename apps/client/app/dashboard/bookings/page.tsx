"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@shedflow/ui/components";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { TableSkeleton, QueryError } from "@/components/query-state";
import { useOrg } from "@/components/org-provider";
import { schedulingApi } from "@/lib/scheduling";
import type { Booking, BookingStatus } from "@/lib/types";

const FILTERS: Array<{ value: string; label: string }> = [
  { value: "upcoming", label: "Upcoming" },
  { value: "pending", label: "Pending" },
  { value: "past", label: "Past" },
  { value: "all", label: "All" },
];

export default function BookingsPage() {
  const { organization, profile } = useOrg();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("upcoming");
  const [selected, setSelected] = useState<Booking | null>(null);

  const query = useQuery({
    queryKey: ["bookings", organization.id],
    queryFn: () => schedulingApi.listBookings(organization, profile.id),
    refetchInterval: 30_000,
  });

  const items = useMemo(() => {
    const list = query.data?.data.items ?? [];
    const now = Date.now();
    return list.filter((booking) => {
      const start = new Date(booking.startAt).getTime();
      if (filter === "upcoming") {
        return start >= now && ["CONFIRMED", "PENDING_CONFIRMATION", "PENDING_PAYMENT"].includes(booking.status);
      }
      if (filter === "pending") {
        return booking.status === "PENDING_CONFIRMATION" || booking.status === "PENDING_PAYMENT";
      }
      if (filter === "past") {
        return start < now || ["CANCELLED", "EXPIRED", "NO_SHOW", "RESCHEDULED"].includes(booking.status);
      }
      return true;
    });
  }, [filter, query.data]);

  const cancel = useMutation({
    mutationFn: (booking: Booking) =>
      schedulingApi.cancelBooking(organization, profile.id, booking.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bookings", organization.id] });
      toast.success("Meeting canceled");
      setSelected(null);
    },
  });
  const confirm = useMutation({
    mutationFn: (booking: Booking) =>
      schedulingApi.confirmBooking(organization, profile.id, booking.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bookings", organization.id] });
      toast.success("Meeting confirmed");
      setSelected(null);
    },
  });
  const noShow = useMutation({
    mutationFn: (booking: Booking) =>
      schedulingApi.markNoShow(organization, profile.id, booking.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bookings", organization.id] });
      toast.success("Marked as no-show");
      setSelected(null);
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Meetings"
        description="Upcoming and past bookings on this workspace."
      />
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((item) => (
          <Button
            key={item.value}
            size="sm"
            variant={filter === item.value ? "default" : "outline"}
            onClick={() => setFilter(item.value)}
          >
            {item.label}
          </Button>
        ))}
      </div>

      {query.isLoading ? <TableSkeleton /> : null}
      {query.error ? (
        <QueryError
          message={query.error instanceof Error ? query.error.message : "Could not load meetings"}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {query.data && items.length === 0 ? (
        <EmptyState
          title="No meetings yet"
          description="When someone books, the meeting will show up here."
          actionHref="/dashboard/event-types"
          actionLabel="Share an event type"
        />
      ) : null}

      {items.length > 0 ? (
        <div className="overflow-hidden rounded-xl border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invitee</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((booking) => (
                <TableRow
                  key={booking.id}
                  className="cursor-pointer"
                  onClick={() => setSelected(booking)}
                >
                  <TableCell className="font-medium">
                    {booking.customer?.name ?? "Invitee"}
                    <div className="text-xs text-muted-foreground">
                      {booking.customer?.email}
                    </div>
                  </TableCell>
                  <TableCell>{booking.eventType?.title ?? "Meeting"}</TableCell>
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

      <Sheet open={Boolean(selected)} onOpenChange={(open: boolean) => !open && setSelected(null)}>
        <SheetContent className="sm:max-w-md">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle>{selected.eventType?.title ?? "Meeting"}</SheetTitle>
                <SheetDescription>
                  {selected.customer?.name} · {selected.customer?.email}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4 text-sm">
                <p>{new Date(selected.startAt).toLocaleString()}</p>
                <StatusBadge status={selected.status} />
                {Object.keys(selected.answers ?? {}).length > 0 ? (
                  <div>
                    <p className="mb-1 font-medium">Answers</p>
                    {Object.entries(selected.answers).map(([key, value]) => (
                      <p key={key} className="text-muted-foreground">
                        {key}: {String(value)}
                      </p>
                    ))}
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2 pt-4">
                  {selected.status === "PENDING_CONFIRMATION" ? (
                    <Button onClick={() => confirm.mutate(selected)}>Confirm</Button>
                  ) : null}
                  {selected.status === "CONFIRMED" ||
                  selected.status === "PENDING_CONFIRMATION" ? (
                    <Button variant="outline" onClick={() => cancel.mutate(selected)}>
                      Cancel
                    </Button>
                  ) : null}
                  {selected.status === "CONFIRMED" ? (
                    <Button variant="ghost" onClick={() => noShow.mutate(selected)}>
                      Mark no-show
                    </Button>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
