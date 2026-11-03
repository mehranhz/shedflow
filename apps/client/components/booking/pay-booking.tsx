"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from "@shedflow/ui/components";

import {
  PaymentInstructions,
  PaymentReceiptStatus,
  PaymentReceiptUpload,
} from "@/components/booking/payment-receipt-upload";
import { StatusBadge } from "@/components/status-badge";
import { formatBookingWhen } from "@/lib/booking-time";
import { manageQuery, readBookingSession } from "@/lib/booking-session";
import { publicScheduling } from "@/lib/scheduling";

export function PayBooking({ uid }: { uid: string }) {
  const t = useTranslations("booking.pay");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const token = searchParams.get("token") ?? "";
  const [viewHref, setViewHref] = useState(
    `/b/${uid}/success${token ? `?token=${encodeURIComponent(token)}` : ""}`,
  );
  useEffect(() => {
    setViewHref(`/b/${uid}/success${manageQuery(uid, token)}`);
  }, [uid, token]);

  const query = useQuery({
    queryKey: ["public-booking", uid],
    queryFn: () => publicScheduling.getBooking(uid),
    refetchInterval: (q) => {
      const status = q.state.data?.data.status;
      if (status === "PENDING_PAYMENT") {
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

  useEffect(() => {
    if (!booking) {
      return;
    }
    if (booking.status === "PENDING_CONFIRMATION" || booking.status === "CONFIRMED") {
      router.replace(viewHref);
    }
  }, [booking, router, viewHref]);

  const showUpload =
    booking?.status === "PENDING_PAYMENT" &&
    (!booking.paymentReceipt?.status ||
      booking.paymentReceipt.status === "REJECTED");

  return (
    <div className="flex min-h-svh items-center justify-center bg-[#f4f5f7] px-4 py-8">
      <Card className="w-full max-w-md shadow-sm">
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {query.isLoading ? (
            <Skeleton className="h-20" />
          ) : booking ? (
            <>
              <p className="font-medium">{booking.eventType?.title ?? t("meetingFallback")}</p>
              <p className="text-muted-foreground">
                {formatBookingWhen(booking.startAt, booking.timezone, locale, "full")}
              </p>
              <StatusBadge status={booking.status} />
              <p>{t("intro")}</p>
              <PaymentInstructions instructions={paymentInstructions} emptyHint />
              <PaymentReceiptStatus
                status={booking.paymentReceipt?.status}
                rejectionReason={booking.paymentReceipt?.rejectionReason}
              />
              {booking.holdExpiresAt ? (
                <p className="text-muted-foreground">{t("holdNote")}</p>
              ) : null}
              {showUpload ? (
                <PaymentReceiptUpload
                  uid={uid}
                  queryToken={token}
                  showInstructions={false}
                  onUploaded={() => {
                    void queryClient.invalidateQueries({ queryKey: ["public-booking", uid] });
                  }}
                />
              ) : booking.status === "PENDING_PAYMENT" ? (
                <p className="text-muted-foreground">{t("awaitingReview")}</p>
              ) : null}
            </>
          ) : (
            <p className="text-muted-foreground">{t("notFound")}</p>
          )}
          <Button asChild variant="outline" className="w-full">
            <Link href={viewHref}>{t("viewBooking")}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
