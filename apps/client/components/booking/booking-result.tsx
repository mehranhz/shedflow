"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from "@shedflow/ui/components";
import { CheckCircle2, Upload } from "lucide-react";

import {
  PaymentReceiptStatus,
  PaymentReceiptUpload,
} from "@/components/booking/payment-receipt-upload";
import { StatusBadge } from "@/components/status-badge";
import { formatBookingWhen } from "@/lib/booking-time";
import { manageQuery, readBookingSession } from "@/lib/booking-session";
import { publicScheduling } from "@/lib/scheduling";

export function BookingResult({
  uid,
  variant,
}: {
  uid: string;
  variant: "success" | "cancelled";
}) {
  const t = useTranslations("booking.result");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const token = searchParams.get("token") ?? "";
  const [manageHref, setManageHref] = useState(
    `/b/${uid}/manage${token ? `?token=${encodeURIComponent(token)}` : ""}`,
  );
  const [receiptHref, setReceiptHref] = useState(
    `/b/${uid}/pay${token ? `?token=${encodeURIComponent(token)}` : ""}`,
  );
  useEffect(() => {
    setManageHref(`/b/${uid}/manage${manageQuery(uid, token)}`);
    setReceiptHref(`/b/${uid}/pay${manageQuery(uid, token)}`);
  }, [uid, token]);
  const query = useQuery({
    queryKey: ["public-booking", uid],
    queryFn: () => publicScheduling.getBooking(uid),
    refetchInterval: (q) => {
      const status = q.state.data?.data.status;
      if (
        status === "PENDING_PAYMENT" ||
        (status === "PENDING_CONFIRMATION" &&
          q.state.data?.data.paymentReceipt?.status === "UPLOADED")
      ) {
        return 4000;
      }
      return false;
    },
  });
  const booking = query.data?.data;
  const session = typeof window === "undefined" ? null : readBookingSession(uid);
  const orgSlug = session?.orgSlug ?? booking?.orgSlug ?? "";
  const eventSlug = session?.eventSlug ?? booking?.eventType?.slug ?? "";
  const eventTypeQuery = useQuery({
    queryKey: ["public-event-type", orgSlug, eventSlug],
    enabled: Boolean(orgSlug && eventSlug),
    queryFn: () => publicScheduling.eventType(orgSlug, eventSlug),
  });
  const paymentInstructions =
    eventTypeQuery.data?.data.paymentInstructions ?? null;
  const needsReceiptUpload =
    booking?.status === "PENDING_PAYMENT" &&
    (!booking.paymentReceipt?.status ||
      booking.paymentReceipt.status === "REJECTED");
  const awaitingReceipt = variant === "success" && needsReceiptUpload;

  return (
    <div className="flex min-h-svh items-center justify-center bg-[#f4f5f7] px-4 py-8">
      <Card className="w-full max-w-md shadow-sm">
        <CardHeader className="text-center">
          {awaitingReceipt ? (
            <Upload className="mx-auto mb-2 size-10 text-primary" aria-hidden />
          ) : (
            <CheckCircle2 className="mx-auto mb-2 size-10 text-emerald-600" aria-hidden />
          )}
          <CardTitle>
            {awaitingReceipt ? t("receiptPending.title") : t(`${variant}.title`)}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-center text-muted-foreground">
            {awaitingReceipt
              ? t("receiptPending.description")
              : t(`${variant}.description`)}
          </p>
          {query.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="mx-auto h-5 w-40" />
              <Skeleton className="mx-auto h-4 w-56" />
            </div>
          ) : booking ? (
            <div className="space-y-3 text-center">
              <div className="space-y-1">
                <p className="font-medium">
                  {booking.eventType?.title ?? t("meetingFallback")}
                </p>
                <p>
                  {formatBookingWhen(booking.startAt, booking.timezone, locale, "full")}
                </p>
                <StatusBadge status={booking.status} />
              </div>
              <PaymentReceiptStatus
                status={booking.paymentReceipt?.status}
                rejectionReason={booking.paymentReceipt?.rejectionReason}
              />
              {needsReceiptUpload ? (
                <div className="text-start">
                  <PaymentReceiptUpload
                    uid={uid}
                    queryToken={token}
                    paymentInstructions={paymentInstructions}
                    onUploaded={() => {
                      void queryClient.invalidateQueries({
                        queryKey: ["public-booking", uid],
                      });
                    }}
                  />
                </div>
              ) : booking.status === "PENDING_PAYMENT" ? (
                <p className="text-muted-foreground">{t("waitingPayment")}</p>
              ) : null}
              {booking.status === "PENDING_CONFIRMATION" &&
              booking.paymentReceipt?.status === "UPLOADED" ? (
                <p className="text-muted-foreground">{t("pendingReview")}</p>
              ) : null}
            </div>
          ) : null}
          <Button asChild variant="outline" className="w-full">
            <Link href={manageHref}>{t("manage")}</Link>
          </Button>
          {needsReceiptUpload ? (
            <Button asChild variant="ghost" className="w-full">
              <Link href={receiptHref}>{t("receiptPending.openPayPage")}</Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
