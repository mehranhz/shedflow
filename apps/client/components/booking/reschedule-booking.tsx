"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Calendar,
  Skeleton,
} from "@shedflow/ui/components";
import { toast } from "sonner";

import { TimezoneCombobox } from "@/components/timezone-combobox";
import { ClientApiError } from "@/lib/http";
import { readBookingSession, tokenFor } from "@/lib/booking-session";
import {
  coerceIanaTimeZone,
  dayKeyInZone,
  formatBookingWhen,
  monthRangeInZone,
} from "@/lib/booking-time";
import { publicScheduling } from "@/lib/scheduling";

export function RescheduleBooking({ uid }: { uid: string }) {
  const t = useTranslations("booking.reschedule");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const queryToken = searchParams.get("token") ?? "";
  const router = useRouter();
  const [timeZone, setTimeZone] = useState(() => coerceIanaTimeZone());
  const [month, setMonth] = useState(new Date());
  const [day, setDay] = useState<Date | undefined>();
  const bookingQuery = useQuery({
    queryKey: ["public-booking", uid],
    queryFn: () => publicScheduling.getBooking(uid),
  });
  const booking = bookingQuery.data?.data;
  const [session, setSession] = useState<ReturnType<typeof readBookingSession>>(null);
  useEffect(() => {
    setSession(readBookingSession(uid));
  }, [uid]);
  const orgSlug =
    searchParams.get("org") ?? session?.orgSlug ?? booking?.orgSlug ?? undefined;
  const eventSlug =
    searchParams.get("event") ?? session?.eventSlug ?? booking?.eventType?.slug ?? undefined;

  const { start: rangeStart, end: rangeEnd } = useMemo(
    () => monthRangeInZone(month, timeZone),
    [month, timeZone],
  );

  const slotsQuery = useQuery({
    queryKey: [
      "reschedule-slots",
      orgSlug,
      eventSlug,
      rangeStart.toISOString(),
      rangeEnd.toISOString(),
      timeZone,
    ],
    enabled: Boolean(orgSlug && eventSlug),
    queryFn: () => publicScheduling.slots(orgSlug!, eventSlug!, rangeStart, rangeEnd, timeZone),
  });

  const slots = slotsQuery.data?.data.slots ?? [];
  const daysWithSlots = useMemo(() => {
    const set = new Set<string>();
    for (const item of slots) {
      set.add(dayKeyInZone(item.startAt, timeZone));
    }
    return set;
  }, [slots, timeZone]);
  const daySlots = day
    ? slots.filter((item) => dayKeyInZone(item.startAt, timeZone) === dayKeyInZone(day, timeZone))
    : [];
  const emptyMonth = Boolean(orgSlug && eventSlug) && !slotsQuery.isLoading && daysWithSlots.size === 0;

  if (bookingQuery.isLoading) {
    return <Skeleton className="mx-auto h-[480px] max-w-3xl" />;
  }

  if (!booking) {
    return (
      <Alert variant="destructive" className="mx-auto max-w-lg">
        <AlertTitle>{t("notFoundTitle")}</AlertTitle>
        <AlertDescription>{t("notFoundBody")}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="mx-auto max-w-3xl rounded-2xl border bg-background p-6 shadow-sm">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("currentTime", {
          when: formatBookingWhen(booking.startAt, booking.timezone, locale, "full"),
        })}
      </p>
      {!orgSlug || !eventSlug ? (
        <Alert className="mt-6">
          <AlertTitle>{t("timesUnavailableTitle")}</AlertTitle>
          <AlertDescription>{t("timesUnavailableBody")}</AlertDescription>
        </Alert>
      ) : (
        <div className="mt-6 flex flex-col gap-6 md:flex-row">
          {slotsQuery.isLoading ? (
            <Skeleton className="h-[320px] w-[280px]" />
          ) : (
            <Calendar
              mode="single"
              month={month}
              timeZone={timeZone}
              onMonthChange={(next) => {
                setMonth(next);
                setDay(undefined);
              }}
              selected={day}
              onSelect={(date: Date | undefined) => setDay(date)}
              disabled={(date: Date) => !daysWithSlots.has(dayKeyInZone(date, timeZone))}
            />
          )}
          <div className="flex-1 space-y-2">
            <TimezoneCombobox
              value={timeZone}
              onChange={(next) => setTimeZone(coerceIanaTimeZone(next))}
              className="w-full"
            />
            {emptyMonth ? (
              <p className="text-sm text-muted-foreground">{t("emptyMonth")}</p>
            ) : null}
            <div
              className="space-y-2"
              role="listbox"
              aria-label={t("title")}
            >
            {daySlots.map((slot) => (
              <Button
                key={slot.startAt}
                type="button"
                role="option"
                aria-label={formatBookingWhen(slot.startAt, timeZone, locale, "full")}
                variant="outline"
                className="w-full"
                onClick={async () => {
                  try {
                    const rescheduleToken = tokenFor(uid, "reschedule", queryToken);
                    await publicScheduling.reschedule(
                      uid,
                      rescheduleToken,
                      slot.startAt,
                      timeZone,
                    );
                    toast.success(t("successToast"));
                    router.push(
                      `/b/${uid}/success${queryToken ? `?token=${queryToken}` : ""}`,
                    );
                  } catch (error) {
                    if (error instanceof ClientApiError && error.code === "SLOT_UNAVAILABLE") {
                      toast.error(t("slotUnavailable"));
                      await slotsQuery.refetch();
                      return;
                    }
                    toast.error(error instanceof Error ? error.message : t("failed"));
                  }
                }}
              >
                {formatBookingWhen(slot.startAt, timeZone, locale, "time")}
              </Button>
            ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
