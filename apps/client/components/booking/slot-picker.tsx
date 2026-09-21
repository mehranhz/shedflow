"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import {
  Button,
  Calendar,
  Checkbox,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Textarea,
} from "@shedflow/ui/components";
import { ArrowLeft, Clock, Globe, MapPin, Video } from "lucide-react";
import { toast } from "sonner";

import { TimezoneCombobox } from "@/components/timezone-combobox";
import { saveBookingSession } from "@/lib/booking-session";
import {
  coerceIanaTimeZone,
  dayKeyInZone,
  formatBookingWhen,
  monthRangeInZone,
} from "@/lib/booking-time";
import { postEmbedBooked } from "@/lib/embed-messages";
import { ClientApiError } from "@/lib/http";
import { publicScheduling } from "@/lib/scheduling";
import type { PublicEventType, PublicOrg, Question, Slot } from "@/lib/types";

function locationIcon(type: PublicEventType["locationType"]) {
  if (type === "GOOGLE_MEET" || type === "LINK") {
    return Video;
  }
  return MapPin;
}

function requiredAnswersMissing(
  questions: Question[],
  answers: Record<string, string | boolean>,
): boolean {
  return questions.some((question) => {
    if (!question.required) {
      return false;
    }
    const value = answers[question.id];
    if (question.type === "checkbox") {
      return value !== true;
    }
    return typeof value !== "string" || value.trim().length === 0;
  });
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
  const t = useTranslations("booking.picker");
  const tEvent = useTranslations("booking.event");
  const locale = useLocale();
  const [timeZone, setTimeZone] = useState(() => coerceIanaTimeZone());
  const [month, setMonth] = useState(new Date());
  const [day, setDay] = useState<Date | undefined>();
  const [slot, setSlot] = useState<Slot | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [answers, setAnswers] = useState<Record<string, string | boolean>>({});
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { start: rangeStart, end: rangeEnd } = useMemo(
    () => monthRangeInZone(month, timeZone),
    [month, timeZone],
  );

  const slotsQuery = useQuery({
    queryKey: ["slots", orgSlug, eventSlug, rangeStart.toISOString(), rangeEnd.toISOString(), timeZone],
    queryFn: () => publicScheduling.slots(orgSlug, eventSlug, rangeStart, rangeEnd, timeZone),
  });

  const slots = slotsQuery.data?.data.slots ?? [];
  const daysWithSlots = useMemo(() => {
    const set = new Set<string>();
    for (const item of slots) {
      set.add(dayKeyInZone(item.startAt, timeZone));
    }
    return set;
  }, [slots, timeZone]);

  const daySlots = useMemo(() => {
    if (!day) {
      return [];
    }
    const key = dayKeyInZone(day, timeZone);
    return slots.filter((item) => dayKeyInZone(item.startAt, timeZone) === key);
  }, [day, slots, timeZone]);

  const emptyMonth = !slotsQuery.isLoading && !slotsQuery.isError && daysWithSlots.size === 0;
  const LocationIcon = locationIcon(eventType.locationType);
  const paid = Boolean(eventType.price && eventType.price.amountMinor > 0);
  const canSubmit =
    Boolean(slot) &&
    name.trim().length > 0 &&
    email.trim().length > 0 &&
    privacyAccepted &&
    !requiredAnswersMissing(eventType.questions, answers);

  const onBook = async (event: FormEvent) => {
    event.preventDefault();
    if (!slot || submitting || !canSubmit) {
      return;
    }
    setSubmitting(true);
    try {
      const result = await publicScheduling.book(
        {
          orgSlug,
          eventTypeSlug: eventSlug,
          startAt: slot.startAt,
          timezone: timeZone,
          invitee: { name: name.trim(), email: email.trim(), phone: phone.trim() || undefined },
          answers,
          metadata: { privacyAcceptedAt: new Date().toISOString() },
          source: embed ? "EMBED" : "HOSTED",
        },
        crypto.randomUUID(),
      );
      saveBookingSession(result.data.uid, {
        orgSlug,
        eventSlug,
        tokens: result.data.actionTokens ?? {},
      });
      const token = result.data.actionTokens?.manage ?? "";
      const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : "";
      if (result.data.checkoutUrl) {
        postEmbedBooked(result.data.uid);
        const target = window.top && window.top !== window ? window.top : window;
        target.location.assign(result.data.checkoutUrl);
        return;
      }
      if (result.data.status === "PENDING_PAYMENT" || paid) {
        postEmbedBooked(result.data.uid);
        window.location.assign(`/b/${result.data.uid}/pay${tokenQuery}`);
        return;
      }
      postEmbedBooked(result.data.uid);
      window.location.assign(`/b/${result.data.uid}/manage${tokenQuery}`);
    } catch (error) {
      if (error instanceof ClientApiError && error.code === "SLOT_UNAVAILABLE") {
        toast.error(t("slotUnavailable"));
        setSlot(null);
        await slotsQuery.refetch();
        return;
      }
      toast.error(error instanceof Error ? error.message : t("bookFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col overflow-hidden rounded-2xl border bg-background shadow-xl md:flex-row">
      <aside className="w-full border-b p-6 md:w-[280px] md:border-r md:border-b-0">
        {organization.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={organization.logoUrl}
            alt=""
            className="mb-4 size-12 rounded-full object-cover"
          />
        ) : null}
        <p className="text-sm font-medium text-muted-foreground">{organization.name}</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{eventType.title}</h1>
        <ul className="mt-6 space-y-3 text-sm text-muted-foreground">
          <li className="flex items-center gap-2">
            <Clock className="size-4" />
            {tEvent("durationMinutes", { count: eventType.durationMinutes })}
          </li>
          <li className="flex items-center gap-2">
            <LocationIcon className="size-4" />
            {eventType.locationType === "GOOGLE_MEET"
              ? tEvent("googleMeet")
              : eventType.locationValue || eventType.locationType.replaceAll("_", " ")}
          </li>
          {slot ? (
            <li className="flex items-start gap-2 text-foreground">
              <Globe className="mt-0.5 size-4" />
              {formatBookingWhen(slot.startAt, timeZone, locale, "full")}
            </li>
          ) : null}
        </ul>
        {eventType.description ? (
          <p className="mt-6 text-sm leading-6 text-muted-foreground">{eventType.description}</p>
        ) : null}
      </aside>

      <section className="min-h-[480px] flex-1 p-6">
        {slot ? (
          <form className="mx-auto max-w-md space-y-4" onSubmit={(event) => void onBook(event)}>
            <Button type="button" variant="ghost" className="-ms-2" onClick={() => setSlot(null)}>
              <ArrowLeft className="size-4" />
              {t("back")}
            </Button>
            <h2 className="text-xl font-semibold">{t("enterDetails")}</h2>
            <div className="grid gap-2">
              <Label htmlFor="invitee-name">{t("name")}</Label>
              <Input
                id="invitee-name"
                name="name"
                autoComplete="name"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="invitee-email">{t("email")}</Label>
              <Input
                id="invitee-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="invitee-phone">{t("phoneOptional")}</Label>
              <Input
                id="invitee-phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </div>
            {eventType.questions.map((question) => (
              <QuestionField
                key={question.id}
                question={question}
                value={answers[question.id]}
                selectPlaceholder={t("selectOption")}
                onChange={(value) =>
                  setAnswers((current) => ({ ...current, [question.id]: value }))
                }
              />
            ))}
            <div className="flex items-start gap-2">
              <Checkbox
                id="privacy-accepted"
                checked={privacyAccepted}
                onCheckedChange={(checked) => setPrivacyAccepted(checked === true)}
              />
              <Label htmlFor="privacy-accepted" className="leading-5 font-normal">
                {t.rich("privacyConsent", {
                  privacy: (chunks) => (
                    <a
                      href="/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-foreground underline underline-offset-2"
                    >
                      {chunks}
                    </a>
                  ),
                })}
              </Label>
            </div>
            <Button className="w-full" type="submit" disabled={submitting || !canSubmit}>
              {submitting
                ? t("scheduling")
                : paid
                  ? t("continuePayment")
                  : t("schedule")}
            </Button>
          </form>
        ) : (
          <div>
            <h2 className="mb-4 text-xl font-semibold">{t("selectDateTime")}</h2>
            <div className="flex flex-col gap-6 lg:flex-row">
              <div>
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
                    className="rounded-lg"
                  />
                )}
                <div className="mt-4">
                  <TimezoneCombobox
                    value={timeZone}
                    onChange={(next) => {
                      setTimeZone(coerceIanaTimeZone(next));
                      setSlot(null);
                    }}
                    className="w-full"
                  />
                </div>
              </div>
              <div className="min-h-[280px] flex-1">
                {slotsQuery.isError ? (
                  <div className="space-y-3">
                    <p className="text-sm text-destructive">
                      {slotsQuery.error instanceof Error
                        ? slotsQuery.error.message
                        : t("loadTimesFailed")}
                    </p>
                    <Button size="sm" variant="outline" onClick={() => void slotsQuery.refetch()}>
                      {tEvent("retry")}
                    </Button>
                  </div>
                ) : emptyMonth ? (
                  <p className="text-sm text-muted-foreground">{t("emptyMonth")}</p>
                ) : day ? (
                  <div>
                    <p className="mb-3 text-sm font-medium">
                      {formatBookingWhen(day, timeZone, locale, "day")}
                    </p>
                    <div
                      className="grid max-h-[360px] gap-2 overflow-auto pe-1"
                      role="listbox"
                      aria-label={t("selectDateTime")}
                    >
                      {daySlots.length === 0 ? (
                        <p className="text-sm text-muted-foreground">{t("emptyDay")}</p>
                      ) : (
                        daySlots.map((item) => (
                          <Button
                            key={item.startAt}
                            type="button"
                            role="option"
                            aria-label={formatBookingWhen(
                              item.startAt,
                              timeZone,
                              locale,
                              "full",
                            )}
                            variant="outline"
                            className="h-11 border-primary/40 font-semibold text-primary hover:bg-primary hover:text-primary-foreground"
                            onClick={() => setSlot(item)}
                          >
                            {formatBookingWhen(item.startAt, timeZone, locale, "time")}
                          </Button>
                        ))
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("pickDay")}</p>
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function QuestionField({
  question,
  value,
  onChange,
  selectPlaceholder,
}: {
  question: Question;
  value: string | boolean | undefined;
  onChange: (value: string | boolean) => void;
  selectPlaceholder: string;
}) {
  if (question.type === "checkbox") {
    return (
      <div className="flex items-start gap-2">
        <Checkbox
          id={question.id}
          checked={value === true}
          onCheckedChange={(checked) => onChange(checked === true)}
        />
        <Label htmlFor={question.id} className="leading-5">
          {question.label}
          {question.required ? " *" : ""}
        </Label>
      </div>
    );
  }

  if (question.type === "select") {
    return (
      <div className="grid gap-2">
        <Label htmlFor={question.id}>
          {question.label}
          {question.required ? " *" : ""}
        </Label>
        <Select
          value={typeof value === "string" ? value : ""}
          onValueChange={onChange}
        >
          <SelectTrigger id={question.id} className="w-full">
            <SelectValue placeholder={selectPlaceholder} />
          </SelectTrigger>
          <SelectContent>
            {(question.options ?? []).map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor={question.id}>
        {question.label}
        {question.required ? " *" : ""}
      </Label>
      {question.type === "textarea" ? (
        <Textarea
          id={question.id}
          required={question.required}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input
          id={question.id}
          type={question.type === "phone" ? "tel" : "text"}
          required={question.required}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  );
}
