"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from "@shedflow/ui/components";
import { CheckCircle2 } from "lucide-react";

import { StatusBadge } from "@/components/status-badge";
import { formatBookingWhen } from "@/lib/booking-time";
import { manageQuery } from "@/lib/booking-session";
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
  const token = searchParams.get("token") ?? "";
  const [manageHref, setManageHref] = useState(
    `/b/${uid}/manage${token ? `?token=${encodeURIComponent(token)}` : ""}`,
  );
  useEffect(() => {
    setManageHref(`/b/${uid}/manage${manageQuery(uid, token)}`);
  }, [uid, token]);
  const query = useQuery({
    queryKey: ["public-booking", uid],
    queryFn: () => publicScheduling.getBooking(uid),
    refetchInterval: 4000,
  });
  const booking = query.data?.data;

  return (
    <div className="flex min-h-svh items-center justify-center bg-[#f4f5f7] px-4">
      <Card className="w-full max-w-md shadow-sm">
        <CardHeader className="text-center">
          <CheckCircle2 className="mx-auto mb-2 size-10 text-emerald-600" />
          <CardTitle>{t(`${variant}.title`)}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center text-sm">
          <p className="text-muted-foreground">{t(`${variant}.description`)}</p>
          {query.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="mx-auto h-5 w-40" />
              <Skeleton className="mx-auto h-4 w-56" />
            </div>
          ) : booking ? (
            <div className="space-y-1">
              <p className="font-medium">
                {booking.eventType?.title ?? t("meetingFallback")}
              </p>
              <p>
                {formatBookingWhen(booking.startAt, booking.timezone, locale, "full")}
              </p>
              <StatusBadge status={booking.status} />
              {booking.status === "PENDING_PAYMENT" ? (
                <p className="pt-2 text-muted-foreground">{t("waitingPayment")}</p>
              ) : null}
            </div>
          ) : null}
          <Button asChild variant="outline">
            <Link href={manageHref}>{t("manage")}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
