"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { addMonths, endOfMonth, format, startOfMonth } from "date-fns";
import {
  Button,
  Calendar,
  Input,
  Label,
  Skeleton,
  Textarea,
} from "@shedflow/ui/components";
import { ArrowLeft, Clock, Globe, MapPin, Video } from "lucide-react";
import { toast } from "sonner";

import { TimezoneCombobox } from "@/components/timezone-combobox";
import { ClientApiError } from "@/lib/http";
import { publicScheduling } from "@/lib/scheduling";
import { guessTimeZone } from "@/lib/timezones";
import type { PublicEventType, PublicOrg, Slot } from "@/lib/types";

function locationIcon(type: PublicEventType["locationType"]) {
  if (type === "GOOGLE_MEET" || type === "LINK") {
    return Video;
  }
  return MapPin;
}

export function SlotPicker({
  orgSlug,
  eventSlug,
  eventType,
  organization,
  embed,
}: {
  orgSlug: string;
  eventSlug: string;
  eventType: PublicEventType;
  organization: PublicOrg;
  embed?: boolean;
}) {
  const [timeZone, setTimeZone] = useState(guessTimeZone());
  const [month, setMonth] = useState(new Date());
  const [day, setDay] = useState<Date | undefined>();
  const [slot, setSlot] = useState<Slot | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const rangeStart = startOfMonth(month);
  const rangeEnd = endOfMonth(addMonths(month, 0));

  const slotsQuery = useQuery({
    queryKey: ["slots", orgSlug, eventSlug, rangeStart.toISOString(), timeZone],
    queryFn: () =>
      publicScheduling.slots(orgSlug, eventSlug, rangeStart, addMonths(rangeStart, 1), timeZone),
  });

  const slots = slotsQuery.data?.data.slots ?? [];
  const daysWithSlots = useMemo(() => {
    const set = new Set<string>();
    for (const item of slots) {
      set.add(format(new Date(item.startLocal), "yyyy-MM-dd"));
    }
    return set;
  }, [slots]);

  const daySlots = useMemo(() => {
    if (!day) {
      return [];
    }
    const key = format(day, "yyyy-MM-dd");
    return slots.filter((item) => format(new Date(item.startLocal), "yyyy-MM-dd") === key);
  }, [day, slots]);

  const LocationIcon = locationIcon(eventType.locationType);

  const onBook = async () => {
    setSubmitting(true);
    try {
      if (!slot) {
        return;
      }
      const result = await publicScheduling.book(
        {
          orgSlug,
          eventTypeSlug: eventSlug,
          startAt: slot.startAt,
          timezone: timeZone,
          invitee: { name, email, phone: phone || undefined },
          answers,
          source: embed ? "EMBED" : "HOSTED",
        },
        crypto.randomUUID(),
      );
      if (result.data.checkoutUrl) {
        window.location.href = result.data.checkoutUrl;
        return;
      }
      window.location.href = `/b/${result.data.uid}/success`;
    } catch (error) {
      if (error instanceof ClientApiError && error.code === "SLOT_UNAVAILABLE") {
        toast.error("That time is no longer available.");
        setSlot(null);
        await slotsQuery.refetch();
        return;
      }
      toast.error(error instanceof Error ? error.message : "Could not book");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col overflow-hidden rounded-2xl border bg-background shadow-xl md:flex-row">
      <aside className="w-full border-b p-6 md:w-[280px] md:border-r md:border-b-0">
        <p className="text-sm font-medium text-muted-foreground">{organization.name}</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{eventType.title}</h1>
        <ul className="mt-6 space-y-3 text-sm text-muted-foreground">
          <li className="flex items-center gap-2">
            <Clock className="size-4" />
            {eventType.durationMinutes} min
          </li>
          <li className="flex items-center gap-2">
            <LocationIcon className="size-4" />
            {eventType.locationType === "GOOGLE_MEET"
              ? "Google Meet"
              : eventType.locationValue || eventType.locationType.replaceAll("_", " ")}
          </li>
          {slot ? (
            <li className="flex items-start gap-2 text-foreground">
              <Globe className="mt-0.5 size-4" />
              {format(new Date(slot.startLocal), "EEEE, MMMM d, yyyy 'at' h:mma")}
            </li>
          ) : null}
        </ul>
        {eventType.description ? (
          <p className="mt-6 text-sm leading-6 text-muted-foreground">{eventType.description}</p>
        ) : null}
      </aside>

      <section className="min-h-[480px] flex-1 p-6">
        {slot ? (
          <div className="mx-auto max-w-md space-y-4">
            <Button variant="ghost" className="-ml-2" onClick={() => setSlot(null)}>
              <ArrowLeft className="size-4" />
              Back
            </Button>
            <h2 className="text-xl font-semibold">Enter details</h2>
            <div className="grid gap-2">
              <Label htmlFor="invitee-name">Name *</Label>
              <Input
                id="invitee-name"
                required
                value={name}
                onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setName(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="invitee-email">Email *</Label>
              <Input
                id="invitee-email"
                type="email"
                required
                value={email}
                onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setEmail(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="invitee-phone">Phone (optional)</Label>
              <Input
                id="invitee-phone"
                value={phone}
                onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setPhone(event.target.value)}
              />
            </div>
            {eventType.questions.map((question) => (
              <div key={question.id} className="grid gap-2">
                <Label htmlFor={question.id}>
                  {question.label}
                  {question.required ? " *" : ""}
                </Label>
                {question.type === "textarea" ? (
                  <Textarea
                    id={question.id}
                    required={question.required}
                    value={answers[question.id] ?? ""}
                    onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                      setAnswers((current) => ({ ...current, [question.id]: event.target.value }))
                    }
                  />
                ) : (
                  <Input
                    id={question.id}
                    required={question.required}
                    value={answers[question.id] ?? ""}
                    onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                      setAnswers((current) => ({ ...current, [question.id]: event.target.value }))
                    }
                  />
                )}
              </div>
            ))}
            <Button
              className="w-full"
              disabled={submitting || !name || !email}
              onClick={() => void onBook()}
            >
              {submitting ? "Scheduling…" : "Schedule event"}
            </Button>
          </div>
        ) : (
          <div>
            <h2 className="mb-4 text-xl font-semibold">Select a Date & Time</h2>
            <div className="flex flex-col gap-6 lg:flex-row">
              <div>
                {slotsQuery.isLoading ? (
                  <Skeleton className="h-[320px] w-[280px]" />
                ) : (
                  <Calendar
                    mode="single"
                    month={month}
                    onMonthChange={setMonth}
                    selected={day}
                    onSelect={(date: Date | undefined) => setDay(date)}
                    disabled={(date: Date) => {
                      const key = format(date, "yyyy-MM-dd");
                      return !daysWithSlots.has(key);
                    }}
                    className="rounded-lg"
                  />
                )}
                <div className="mt-4">
                  <TimezoneCombobox value={timeZone} onChange={setTimeZone} className="w-full" />
                </div>
              </div>
              <div className="min-h-[280px] flex-1">
                {day ? (
                  <div>
                    <p className="mb-3 text-sm font-medium">
                      {format(day, "EEEE, MMMM d")}
                    </p>
                    <div className="grid max-h-[360px] gap-2 overflow-auto pr-1">
                      {daySlots.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No times available this day.
                        </p>
                      ) : (
                        daySlots.map((item) => (
                          <Button
                            key={item.startAt}
                            variant="outline"
                            className="h-11 border-primary/40 font-semibold text-primary hover:bg-primary hover:text-primary-foreground"
                            onClick={() => setSlot(item)}
                          >
                            {format(new Date(item.startLocal), "h:mma").toLowerCase()}
                          </Button>
                        ))
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Pick a day on the calendar to see times.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
