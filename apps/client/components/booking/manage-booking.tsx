"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import {
  Alert,
  AlertDescription,
  AlertTitle,
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
  CardHeader,
  CardTitle,
  Skeleton,
  Textarea,
} from "@shedflow/ui/components";
import { toast } from "sonner";

import { StatusBadge } from "@/components/status-badge";
import { formatBookingWhen } from "@/lib/booking-time";
import { readBookingSession, tokenFor } from "@/lib/booking-session";
import { publicScheduling } from "@/lib/scheduling";

export function ManageBooking({ uid }: { uid: string }) {
  const t = useTranslations("booking.manage");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const queryToken = searchParams.get("token") ?? "";
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const query = useQuery({
    queryKey: ["public-booking", uid],
    queryFn: () => publicScheduling.getBooking(uid),
  });
  const booking = query.data?.data;
  const [session, setSession] = useState<ReturnType<typeof readBookingSession>>(null);
  useEffect(() => {
    setSession(readBookingSession(uid));
  }, [uid]);
  const orgSlug = searchParams.get("org") ?? session?.orgSlug ?? booking?.orgSlug ?? "";
  const eventSlug = searchParams.get("event") ?? session?.eventSlug ?? booking?.eventType?.slug ?? "";
  const rescheduleHref = `/b/${uid}/reschedule?${new URLSearchParams({
    ...(queryToken ? { token: queryToken } : {}),
    ...(orgSlug ? { org: orgSlug } : {}),
    ...(eventSlug ? { event: eventSlug } : {}),
  }).toString()}`;

  return (
    <div className="flex min-h-svh items-center justify-center bg-[#f4f5f7] px-4">
      <Card className="w-full max-w-md shadow-sm">
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {query.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-6 w-24" />
            </div>
          ) : query.error && !booking ? (
            <Alert variant="destructive">
              <AlertTitle>{t("notFoundTitle")}</AlertTitle>
              <AlertDescription>
                {query.error instanceof Error ? query.error.message : t("notFoundBody")}
              </AlertDescription>
            </Alert>
          ) : booking ? (
            <>
              <p className="text-lg font-semibold">
                {booking.eventType?.title ?? t("meetingFallback")}
              </p>
              <p>
                {formatBookingWhen(booking.startAt, booking.timezone, locale, "full")}
              </p>
              <StatusBadge status={booking.status} />
              {booking.status === "CANCELLED" || booking.status === "EXPIRED" ? null : (
                <div className="flex gap-2 pt-2">
                  <Button asChild variant="outline">
                    <Link href={rescheduleHref}>{t("reschedule")}</Link>
                  </Button>
                  <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive">{t("cancel")}</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("cancelDialogTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t("cancelDialogBody")}
                        </AlertDialogDescription>
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
                          disabled={cancelling}
                          onClick={async () => {
                            setCancelling(true);
                            try {
                              const cancelToken = tokenFor(uid, "cancel", queryToken);
                              await publicScheduling.cancel(uid, cancelToken, reason);
                              toast.success(t("canceledToast"));
                              setCancelOpen(false);
                              router.push(
                                `/b/${uid}/cancel${queryToken ? `?token=${queryToken}` : ""}`,
                              );
                            } catch (error) {
                              toast.error(
                                error instanceof Error ? error.message : t("cancelFailed"),
                              );
                            } finally {
                              setCancelling(false);
                            }
                          }}
                        >
                          {cancelling ? t("canceling") : t("cancelMeeting")}
                        </Button>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">{t("loading")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
