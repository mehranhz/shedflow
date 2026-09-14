"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addMonths, format, startOfMonth } from "date-fns";
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
import { previewStore } from "@/lib/preview-store";
import { publicScheduling } from "@/lib/scheduling";
import { guessTimeZone } from "@/lib/timezones";

export function RescheduleBooking({ uid }: { uid: string }) {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const router = useRouter();
  const [timeZone, setTimeZone] = useState(guessTimeZone());
  const [month, setMonth] = useState(new Date());
  const [day, setDay] = useState<Date | undefined>();
  const bookingQuery = useQuery({
    queryKey: ["public-booking", uid],
    queryFn: () => publicScheduling.getBooking(uid),
  });
  const booking = bookingQuery.data?.data;
  const bundle = booking ? previewStore.getById(booking.organizationId) : null;
  const eventType = bundle?.eventTypes.find((item) => item.id === booking?.eventTypeId);
  const orgSlug = bundle?.org.slug;
  const eventSlug = eventType?.slug ?? booking?.eventType?.slug;

  const slotsQuery = useQuery({
    queryKey: ["reschedule-slots", orgSlug, eventSlug, month.toISOString(), timeZone],
    enabled: Boolean(orgSlug && eventSlug),
    queryFn: () =>
      publicScheduling.slots(
        orgSlug!,
        eventSlug!,
        startOfMonth(month),
        addMonths(startOfMonth(month), 1),
        timeZone,
      ),
  });

  const slots = slotsQuery.data?.data.slots ?? [];
  const daysWithSlots = useMemo(() => {
    const set = new Set<string>();
    for (const item of slots) {
      set.add(format(new Date(item.startLocal), "yyyy-MM-dd"));
    }
    return set;
  }, [slots]);
  const daySlots = day
    ? slots.filter((item) => format(new Date(item.startLocal), "yyyy-MM-dd") === format(day, "yyyy-MM-dd"))
    : [];

  if (bookingQuery.isLoading) {
    return <Skeleton className="mx-auto h-[480px] max-w-3xl" />;
  }

  if (!booking) {
    return (
      <Alert variant="destructive" className="mx-auto max-w-lg">
        <AlertTitle>Booking not found</AlertTitle>
        <AlertDescription>This manage link may have expired.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="mx-auto max-w-3xl rounded-2xl border bg-background p-6 shadow-sm">
      <h1 className="text-xl font-semibold">Reschedule</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Current time: {new Date(booking.startAt).toLocaleString()}
      </p>
      <div className="mt-6 flex flex-col gap-6 md:flex-row">
        <Calendar
          mode="single"
          month={month}
          onMonthChange={setMonth}
          selected={day}
          onSelect={(date: Date | undefined) => setDay(date)}
          disabled={(date: Date) => !daysWithSlots.has(format(date, "yyyy-MM-dd"))}
        />
        <div className="flex-1 space-y-2">
          <TimezoneCombobox value={timeZone} onChange={setTimeZone} className="w-full" />
          {daySlots.map((slot) => (
            <Button
              key={slot.startAt}
              variant="outline"
              className="w-full"
              onClick={async () => {
                try {
                  await publicScheduling.reschedule(uid, token, slot.startAt, timeZone);
                  toast.success("Meeting rescheduled");
                  router.push(`/b/${uid}/success?token=${token}`);
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Could not reschedule");
                }
              }}
            >
              {format(new Date(slot.startLocal), "h:mma").toLowerCase()}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
