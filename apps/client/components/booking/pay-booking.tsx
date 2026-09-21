"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from "@shedflow/ui/components";
import { toast } from "sonner";

import { StatusBadge } from "@/components/status-badge";
import { manageQuery } from "@/lib/booking-session";
import { publicScheduling } from "@/lib/scheduling";

export function PayBooking({ uid }: { uid: string }) {
  const t = useTranslations("booking.pay");
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [viewHref, setViewHref] = useState(
    `/b/${uid}/success${token ? `?token=${encodeURIComponent(token)}` : ""}`,
  );
  const [retrying, setRetrying] = useState(false);
  useEffect(() => {
    setViewHref(`/b/${uid}/success${manageQuery(uid, token)}`);
  }, [uid, token]);
  const query = useQuery({
    queryKey: ["public-booking", uid],
    queryFn: () => publicScheduling.getBooking(uid),
    refetchInterval: 4000,
  });
  const booking = query.data?.data;

  const redirectIfReady = (checkoutUrl: string | null | undefined) => {
    if (checkoutUrl) {
      window.location.assign(checkoutUrl);
      return true;
    }
    return false;
  };

  useEffect(() => {
    if (booking?.checkoutUrl) {
      redirectIfReady(booking.checkoutUrl);
    }
  }, [booking?.checkoutUrl]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!booking || booking.checkoutUrl || booking.status !== "PENDING_PAYMENT") {
        return;
      }
      try {
        const result = await publicScheduling.retryCheckout(uid);
        if (!cancelled) {
          redirectIfReady(result.data.checkoutUrl);
        }
      } catch {
        // Billing may be missing; keep the stub page.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [booking, uid]);

  return (
    <div className="flex min-h-svh items-center justify-center bg-[#f4f5f7] px-4">
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
              <StatusBadge status={booking.status} />
              <p className="text-muted-foreground">{t("holdNote")}</p>
              <Button
                type="button"
                disabled={retrying}
                onClick={async () => {
                  setRetrying(true);
                  try {
                    const result = await publicScheduling.retryCheckout(uid);
                    if (redirectIfReady(result.data.checkoutUrl)) {
                      return;
                    }
                    toast.message(t("notReady"));
                  } catch (error) {
                    toast.error(
                      error instanceof Error ? error.message : t("startFailed"),
                    );
                  } finally {
                    setRetrying(false);
                  }
                }}
              >
                {retrying ? t("checking") : t("retry")}
              </Button>
            </>
          ) : (
            <p className="text-muted-foreground">{t("notFound")}</p>
          )}
          <Button asChild variant="outline">
            <Link href={viewHref}>{t("viewBooking")}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
