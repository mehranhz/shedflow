"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { signOut } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  Card,
  CardContent,
  Skeleton,
  Textarea,
} from "@shedflow/ui/components";
import { toast } from "sonner";

import { LocaleSwitcher } from "@/components/i18n/locale-switcher";
import { Logo } from "@/components/logo";
import { StatusBadge } from "@/components/status-badge";
import { apiBff } from "@/lib/bff";
import { formatBookingWhen } from "@/lib/booking-time";
import type { Booking, BookingStatus, Page } from "@/lib/types";

const CANCELLABLE = new Set<BookingStatus>([
  "PENDING_PAYMENT",
  "PENDING_CONFIRMATION",
  "CONFIRMED",
]);

type ClientBooking = Booking & {
  organization?: { id: string; name: string; slug: string };
};

export function MyBookingsList() {
  const t = useTranslations("clientBookings");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["me-bookings"],
    queryFn: () => apiBff<Page<ClientBooking>>("me/bookings"),
  });

  const items = query.data?.items ?? [];

  return (
    <div className="min-h-svh bg-[#f6f7f9]">
      <header className="flex items-center justify-between gap-3 border-b bg-background px-4 py-3 sm:px-6">
        <Logo />
        <div className="flex items-center gap-2">
          <LocaleSwitcher compact />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void signOut({ redirectTo: "/login" })}
          >
            {t("signOut")}
          </Button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
        </div>

        {query.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
          </div>
        ) : query.isError ? (
          <Alert variant="destructive">
            <AlertDescription className="flex items-center justify-between gap-3">
              <span>{query.error instanceof Error ? query.error.message : t("loadFailed")}</span>
              <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
                {t("retry")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-background px-6 py-16 text-center">
            <h2 className="text-lg font-semibold">{t("emptyTitle")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{t("emptyBody")}</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((booking) => (
              <li key={booking.id}>
                <BookingCard
                  booking={booking}
                  locale={locale}
                  onCancelled={() => void queryClient.invalidateQueries({ queryKey: ["me-bookings"] })}
                />
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function BookingCard({
  booking,
  locale,
  onCancelled,
}: {
  booking: ClientBooking;
  locale: string;
  onCancelled: () => void;
}) {
  const t = useTranslations("clientBookings");
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  const canCancel = CANCELLABLE.has(booking.status);

  const cancel = useMutation({
    mutationFn: () =>
      apiBff<ClientBooking>(`me/bookings/${booking.id}/cancel`, {
        method: "POST",
        body: JSON.stringify(reason.trim() ? { reason: reason.trim() } : {}),
      }),
    onSuccess: () => {
      toast.success(t("canceledToast"));
      setOpen(false);
      setReason("");
      onCancelled();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t("cancelFailed"));
    },
  });

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="font-semibold">{booking.eventType?.title ?? t("meetingFallback")}</p>
          {booking.organization?.name ? (
            <p className="text-sm text-muted-foreground">{booking.organization.name}</p>
          ) : null}
          <p className="text-sm">
            {formatBookingWhen(booking.startAt, booking.timezone, locale, "full")}
          </p>
          <StatusBadge status={booking.status} />
        </div>
        {canCancel ? (
          <AlertDialog open={open} onOpenChange={setOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                {t("cancel")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("cancelDialogTitle")}</AlertDialogTitle>
                <AlertDialogDescription>{t("cancelDialogBody")}</AlertDialogDescription>
              </AlertDialogHeader>
              <Textarea
                placeholder={t("reasonPlaceholder")}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
              <AlertDialogFooter>
                <AlertDialogCancel>{t("keepMeeting")}</AlertDialogCancel>
                <Button
                  variant="destructive"
                  disabled={cancel.isPending}
                  onClick={() => cancel.mutate()}
                >
                  {cancel.isPending ? t("canceling") : t("cancelMeeting")}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </CardContent>
    </Card>
  );
}
