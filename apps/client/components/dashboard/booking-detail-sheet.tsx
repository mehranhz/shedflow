"use client";

import Link from "next/link";
import { useEffect, useState, type ChangeEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  Button,
  Input,
  Label,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@shedflow/ui/components";
import { toast } from "sonner";

import { StatusBadge } from "@/components/status-badge";
import { canManageWorkspace, useOrg } from "@/components/org-provider";
import { schedulingApi } from "@/lib/scheduling";
import type { Booking } from "@/lib/types";

function toLocalInput(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function BookingDetailSheet({
  booking,
  open,
  onOpenChange,
  onUpdated,
}: {
  booking: Booking | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: (booking: Booking | null) => void;
}) {
  const t = useTranslations("dashboard.bookings.detail");
  const tc = useTranslations("dashboard.common");
  const { organization, profile, role } = useOrg();
  const queryClient = useQueryClient();
  const canRefund = canManageWorkspace(role);
  const [rescheduleLocal, setRescheduleLocal] = useState("");
  const [reason, setReason] = useState("");
  const [showReschedule, setShowReschedule] = useState(false);

  useEffect(() => {
    if (booking) {
      setRescheduleLocal(toLocalInput(booking.startAt));
      setReason("");
      setShowReschedule(false);
    }
  }, [booking]);

  const invalidate = async (next?: Booking) => {
    await queryClient.invalidateQueries({ queryKey: ["bookings", organization.id] });
    await queryClient.invalidateQueries({ queryKey: ["customers", organization.id] });
    onUpdated(next ?? null);
  };

  const cancel = useMutation({
    mutationFn: () =>
      schedulingApi.cancelBooking(
        organization,
        profile.id,
        booking!.id,
        reason.trim() || undefined,
      ),
    onSuccess: async (result) => {
      toast.success(t("canceled"));
      await invalidate(result.data);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t("cancelFailed"));
    },
  });

  const confirm = useMutation({
    mutationFn: () =>
      schedulingApi.confirmBooking(organization, profile.id, booking!.id),
    onSuccess: async (result) => {
      toast.success(t("confirmed"));
      await invalidate(result.data);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t("confirmFailed"));
    },
  });

  const noShow = useMutation({
    mutationFn: () =>
      schedulingApi.markNoShow(organization, profile.id, booking!.id),
    onSuccess: async (result) => {
      toast.success(t("noShowMarked"));
      await invalidate(result.data);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t("noShowFailed"));
    },
  });

  const reschedule = useMutation({
    mutationFn: async () => {
      if (!rescheduleLocal) {
        throw new Error(t("pickStart"));
      }
      return schedulingApi.rescheduleBooking(
        organization,
        profile.id,
        booking!.id,
        new Date(rescheduleLocal).toISOString(),
        organization.timezone,
      );
    },
    onSuccess: async (result) => {
      toast.success(t("rescheduled"));
      setShowReschedule(false);
      await invalidate(result.data);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t("rescheduleFailed"));
    },
  });

  const actionable =
    booking &&
    (booking.status === "CONFIRMED" ||
      booking.status === "PENDING_CONFIRMATION" ||
      booking.status === "PENDING_PAYMENT");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        {booking ? (
          <>
            <SheetHeader>
              <SheetTitle>{booking.eventType?.title ?? tc("meeting")}</SheetTitle>
              <SheetDescription>
                {booking.customer?.name ?? tc("invitee")}
                {booking.customer?.email ? ` · ${booking.customer.email}` : ""}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-6 space-y-5 text-sm">
              <div className="space-y-1">
                <p className="font-medium">{t("when")}</p>
                <p>
                  {new Date(booking.startAt).toLocaleString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
                <p className="text-muted-foreground">
                  {t("inviteeZone", { timezone: booking.timezone })}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={booking.status} />
                <span className="text-xs text-muted-foreground">
                  {t("source", { source: booking.source })}
                </span>
              </div>

              {booking.customerId ? (
                <p>
                  <Link
                    href={`/dashboard/customers/${booking.customerId}`}
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    {t("viewContact")}
                  </Link>
                </p>
              ) : null}

              {Object.keys(booking.answers ?? {}).length > 0 ? (
                <div>
                  <p className="mb-1 font-medium">{t("answers")}</p>
                  <ul className="space-y-1 text-muted-foreground">
                    {Object.entries(booking.answers).map(([key, value]) => (
                      <li key={key}>
                        <span className="font-medium text-foreground">{key}:</span>{" "}
                        {String(value)}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {booking.cancellationReason ? (
                <p className="text-muted-foreground">
                  {t("cancelReason", { reason: booking.cancellationReason })}
                </p>
              ) : null}

              {showReschedule ? (
                <div className="grid gap-2 rounded-lg border p-3">
                  <Label htmlFor="reschedule-at">{t("newStart")}</Label>
                  <Input
                    id="reschedule-at"
                    type="datetime-local"
                    value={rescheduleLocal}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setRescheduleLocal(event.target.value)
                    }
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => reschedule.mutate()}
                      disabled={reschedule.isPending}
                    >
                      {reschedule.isPending ? t("saving") : t("saveNewTime")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowReschedule(false)}
                    >
                      {t("back")}
                    </Button>
                  </div>
                </div>
              ) : null}

              {actionable && !showReschedule ? (
                <div className="grid gap-2 border-t pt-4">
                  {booking.status === "PENDING_CONFIRMATION" ||
                  booking.status === "PENDING_PAYMENT" ||
                  booking.status === "CONFIRMED" ? (
                    <div className="grid gap-2">
                      <Label htmlFor="cancel-reason">{t("cancelReasonLabel")}</Label>
                      <Input
                        id="cancel-reason"
                        value={reason}
                        onChange={(event: ChangeEvent<HTMLInputElement>) =>
                          setReason(event.target.value)
                        }
                        placeholder={t("cancelReasonPlaceholder")}
                      />
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    {booking.status === "PENDING_CONFIRMATION" ? (
                      <Button
                        onClick={() => confirm.mutate()}
                        disabled={confirm.isPending}
                      >
                        {t("confirm")}
                      </Button>
                    ) : null}
                    {(booking.status === "CONFIRMED" ||
                      booking.status === "PENDING_CONFIRMATION") && (
                      <Button
                        variant="outline"
                        onClick={() => setShowReschedule(true)}
                      >
                        {t("reschedule")}
                      </Button>
                    )}
                    {(booking.status === "CONFIRMED" ||
                      booking.status === "PENDING_CONFIRMATION" ||
                      booking.status === "PENDING_PAYMENT") && (
                      <Button
                        variant="outline"
                        onClick={() => cancel.mutate()}
                        disabled={cancel.isPending}
                      >
                        {cancel.isPending ? t("canceling") : t("cancel")}
                      </Button>
                    )}
                    {booking.status === "CONFIRMED" ? (
                      <Button
                        variant="ghost"
                        onClick={() => noShow.mutate()}
                        disabled={noShow.isPending}
                      >
                        {t("markNoShow")}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {canRefund ? (
                <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">{t("refundTitle")}</p>
                  <p className="mt-1">{t("refundBody")}</p>
                  <Button className="mt-3" size="sm" variant="secondary" disabled>
                    {t("refundCta")}
                  </Button>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
