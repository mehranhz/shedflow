"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
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

import { PaymentInstructions } from "@/components/booking/payment-receipt-upload";
import { TimezoneCombobox } from "@/components/timezone-combobox";
import { requestBookingOtp, verifyBookingOtp } from "@/lib/booking-otp";
import { saveBookingSession } from "@/lib/booking-session";
import {
  coerceIanaTimeZone,
  dayKeyInZone,
  formatBookingWhen,
  monthRangeInZone,
} from "@/lib/booking-time";
import { postEmbedBooked } from "@/lib/embed-messages";
import { apiBff } from "@/lib/bff";
import { ClientApiError } from "@/lib/http";
import { trackPortalEvent } from "@/lib/portal/analytics";
import { publicScheduling } from "@/lib/scheduling";
import type { PublicEventType, PublicOrg, Question, Slot } from "@/lib/types";
import { randomUUID } from "@/lib/uuid";

type BookingStep = "details" | "otp";

function locationIcon(type: PublicEventType["locationType"]) {
  if (type === "GOOGLE_MEET" || type === "LINK") {
    return Video;
  }
  return MapPin;
}

function rescheduleConflictMessage(
  error: unknown,
  t: (key: "outsidePolicy" | "slotUnavailable" | "conflict") => string,
): string | null {
  if (!(error instanceof ClientApiError)) {
    return null;
  }
  if (error.code === "OUTSIDE_POLICY") {
    return t("outsidePolicy");
  }
  if (error.code === "SLOT_UNAVAILABLE") {
    return t("slotUnavailable");
  }
  if (error.code === "CONFLICT" || error.status === 409) {
    return t("conflict");
  }
  return null;
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
  portalBooking,
  reschedule,
}: {
  orgSlug: string;
  eventSlug: string;
  eventType: PublicEventType;
  organization: PublicOrg;
  embed?: boolean;
  portalBooking?: {
    customerOrgId: string;
    name: string;
    email: string;
    phone: string;
    timezone?: string | null;
    recurringEnabled?: boolean;
  };
  reschedule?: {
    bookingUid: string;
    customerOrgId: string;
    onRescheduled?: (result: { uid: string }) => void | Promise<void>;
  };
}) {
  const t = useTranslations("booking.picker");
  const tAppt = useTranslations("portal.appointments");
  const tEvent = useTranslations("booking.event");
  const locale = useLocale();
  const [timeZone, setTimeZone] = useState(() =>
    coerceIanaTimeZone(portalBooking?.timezone ?? undefined),
  );
  const [month, setMonth] = useState(new Date());
  const [day, setDay] = useState<Date | undefined>();
  const [slot, setSlot] = useState<Slot | null>(null);
  const [name, setName] = useState(portalBooking?.name ?? "");
  const [email, setEmail] = useState(portalBooking?.email ?? "");
  const [phone, setPhone] = useState(portalBooking?.phone ?? "");
  const [repeats, setRepeats] = useState(false);
  const [occurrences, setOccurrences] = useState(4);
  const portalKey = useRef(randomUUID());
  const [otpCode, setOtpCode] = useState("");
  const [step, setStep] = useState<BookingStep>("details");
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
  const receiptRequired = Boolean(eventType.requiresPaymentReceipt);
  const trimmedEmail = email.trim();
  const portalMode = Boolean(portalBooking) && !reschedule;
  const detailsReady =
    Boolean(slot) &&
    name.trim().length > 0 &&
    (portalMode || phone.trim().length > 0) &&
    privacyAccepted &&
    !requiredAnswersMissing(eventType.questions, answers);

  const onPortalBook = async (event: FormEvent) => {
    event.preventDefault();
    if (!slot || !portalBooking || submitting || !detailsReady) {
      return;
    }
    setSubmitting(true);
    try {
      const result = await apiBff<{ uid: string; status: string }>("customer/bookings", {
        method: "POST",
        customerOrgId: portalBooking.customerOrgId,
        idempotencyKey: portalKey.current,
        body: JSON.stringify({
          eventTypeSlug: eventSlug,
          startAt: slot.startAt,
          timezone: timeZone,
          answers,
          occurrences: repeats ? occurrences : 1,
        }),
      });
      trackPortalEvent("portal_book_start", {
        organization_slug: orgSlug,
        event_slug: eventSlug,
        booking_uid: result.uid,
        source: "PORTAL",
      });
      const receipt = result.status === "PENDING_PAYMENT" || receiptRequired;
      window.location.assign(
        `/portal/appointments/${encodeURIComponent(result.uid)}${receipt ? "?receipt=1" : ""}`,
      );
    } catch (error) {
      if (error instanceof ClientApiError && error.code === "SLOT_UNAVAILABLE") {
        toast.error(t("slotUnavailable"));
        portalKey.current = randomUUID();
        setSlot(null);
        await slotsQuery.refetch();
        return;
      }
      toast.error(error instanceof Error ? error.message : t("bookFailed"));
      portalKey.current = randomUUID();
    } finally {
      setSubmitting(false);
    }
  };

  const onReschedule = async (event: FormEvent) => {
    event.preventDefault();
    if (!slot || !reschedule || submitting) {
      return;
    }
    setSubmitting(true);
    try {
      const result = await apiBff<{ uid: string }>(
        `customer/bookings/${encodeURIComponent(reschedule.bookingUid)}/reschedule`,
        {
          method: "POST",
          customerOrgId: reschedule.customerOrgId,
          idempotencyKey: portalKey.current,
          body: JSON.stringify({ startAt: slot.startAt, timezone: timeZone }),
        },
      );
      if (reschedule.onRescheduled) {
        await reschedule.onRescheduled(result);
      } else {
        window.location.assign(`/portal/appointments/${encodeURIComponent(result.uid)}`);
      }
    } catch (error) {
      const message = rescheduleConflictMessage(error, tAppt);
      if (message) {
        toast.error(message);
        portalKey.current = randomUUID();
        if (error instanceof ClientApiError && error.code === "SLOT_UNAVAILABLE") {
          setSlot(null);
          await slotsQuery.refetch();
        }
        return;
      }
      toast.error(error instanceof Error ? error.message : t("bookFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const completeBooking = async (verifiedPhone: string) => {
    if (!slot) {
      return;
    }
    const result = await publicScheduling.book(
      {
        orgSlug,
        eventTypeSlug: eventSlug,
        startAt: slot.startAt,
        timezone: timeZone,
        invitee: {
          name: name.trim(),
          phone: verifiedPhone,
          ...(trimmedEmail ? { email: trimmedEmail } : {}),
        },
        answers,
        metadata: { privacyAcceptedAt: new Date().toISOString() },
        source: embed ? "EMBED" : "HOSTED",
      },
      randomUUID(),
    );
    saveBookingSession(result.data.uid, {
      orgSlug,
      eventSlug,
      tokens: result.data.actionTokens ?? {},
    });
    trackPortalEvent("portal_book_start", {
      organization_slug: orgSlug,
      event_slug: eventSlug,
      booking_uid: result.data.uid,
      source: embed ? "EMBED" : "HOSTED",
    });
    const token = result.data.actionTokens?.manage ?? "";
    const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : "";
    if (result.data.status === "PENDING_PAYMENT" || receiptRequired) {
      postEmbedBooked(result.data.uid);
      window.location.assign(`/b/${result.data.uid}/pay${tokenQuery}`);
      return;
    }
    postEmbedBooked(result.data.uid);
    window.location.assign(`/b/${result.data.uid}/manage${tokenQuery}`);
  };

  const onSendCode = async (event: FormEvent) => {
    event.preventDefault();
    if (!slot || submitting || !detailsReady) {
      return;
    }
    if (!phone.trim()) {
      toast.error(t("phoneRequired"));
      return;
    }
    setSubmitting(true);
    try {
      const sent = await requestBookingOtp(phone.trim());
      if (!sent.ok && !sent.alreadySent) {
        toast.error(sent.message || t("otpFailed"));
        return;
      }
      setOtpCode("");
      setStep("otp");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("otpFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const onVerifyAndBook = async (event: FormEvent) => {
    event.preventDefault();
    if (!slot || submitting || otpCode.trim().length === 0) {
      return;
    }
    setSubmitting(true);
    try {
      const verified = await verifyBookingOtp(phone.trim(), otpCode.trim());
      if (!verified.ok) {
        toast.error(verified.message || t("verifyFailed"));
        return;
      }
      await completeBooking(verified.phone);
    } catch (error) {
      if (error instanceof ClientApiError && error.code === "SLOT_UNAVAILABLE") {
        toast.error(t("slotUnavailable"));
        setStep("details");
        setSlot(null);
        await slotsQuery.refetch();
        return;
      }
      toast.error(error instanceof Error ? error.message : t("bookFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const onResendCode = async () => {
    if (submitting || !phone.trim()) {
      return;
    }
    setSubmitting(true);
    try {
      const sent = await requestBookingOtp(phone.trim());
      if (!sent.ok && !sent.alreadySent) {
        toast.error(sent.message || t("otpFailed"));
        return;
      }
      toast.success(t("sendCode"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("otpFailed"));
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
        {receiptRequired ? (
          <div className="mt-6">
            <PaymentInstructions
              instructions={eventType.paymentInstructions}
              emptyHint
            />
          </div>
        ) : null}
      </aside>

      <section className="min-h-[480px] flex-1 p-6">
        {slot && step === "otp" ? (
          <form className="mx-auto max-w-md space-y-4" onSubmit={(event) => void onVerifyAndBook(event)}>
            <Button
              type="button"
              variant="ghost"
              className="-ms-2"
              onClick={() => {
                setStep("details");
                setOtpCode("");
              }}
            >
              <ArrowLeft className="size-4" />
              {t("changePhone")}
            </Button>
            <h2 className="text-xl font-semibold">{t("verificationCode")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("verificationHint", { phone: phone.trim() })}
            </p>
            <div className="grid gap-2">
              <Label htmlFor="invitee-otp">{t("verificationCode")}</Label>
              <Input
                id="invitee-otp"
                name="otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={otpCode}
                onChange={(event) => setOtpCode(event.target.value)}
              />
            </div>
            <Button
              className="w-full"
              type="submit"
              disabled={submitting || otpCode.trim().length === 0}
            >
              {submitting
                ? t("verifying")
                : receiptRequired
                  ? t("verifyAndContinueReceipt")
                  : t("verifyAndSchedule")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={submitting}
              onClick={() => void onResendCode()}
            >
              {t("resendCode")}
            </Button>
          </form>
        ) : slot && reschedule ? (
          <form className="mx-auto max-w-md space-y-4" onSubmit={(event) => void onReschedule(event)}>
            <Button
              type="button"
              variant="ghost"
              className="-ms-2"
              onClick={() => setSlot(null)}
            >
              <ArrowLeft className="size-4" />
              {t("back")}
            </Button>
            <h2 className="text-xl font-semibold">{t("confirmReschedule")}</h2>
            <Button className="w-full" type="submit" disabled={submitting}>
              {submitting ? t("scheduling") : t("confirmReschedule")}
            </Button>
          </form>
        ) : slot ? (
          <form
            className="mx-auto max-w-md space-y-4"
            onSubmit={(event) => void (portalMode ? onPortalBook(event) : onSendCode(event))}
          >
            <Button
              type="button"
              variant="ghost"
              className="-ms-2"
              onClick={() => {
                setSlot(null);
                setStep("details");
                setOtpCode("");
              }}
            >
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
              <Label htmlFor="invitee-email">{t("emailOptional")}</Label>
              <Input
                id="invitee-email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                readOnly={Boolean(portalBooking?.email)}
                aria-readonly={portalBooking?.email ? true : undefined}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="invitee-phone">{t("phone")}</Label>
              <Input
                id="invitee-phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                required={!portalMode}
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
            {portalBooking?.recurringEnabled ? (
              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="repeats-weekly"
                    checked={repeats}
                    onCheckedChange={(checked) => setRepeats(checked === true)}
                  />
                  <Label htmlFor="repeats-weekly" className="font-normal leading-5">
                    {t("repeatsWeekly")}
                  </Label>
                </div>
                {repeats ? (
                  <div className="grid gap-2">
                    <Label htmlFor="occurrence-count">{t("occurrences")}</Label>
                    <Input
                      id="occurrence-count"
                      type="number"
                      min={2}
                      max={12}
                      value={occurrences}
                      onChange={(event) => {
                        const next = Number(event.target.value);
                        setOccurrences(Number.isFinite(next) ? Math.min(12, Math.max(2, next)) : 2);
                      }}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
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
            <Button className="w-full" type="submit" disabled={submitting || !detailsReady}>
              {portalMode
                ? submitting
                  ? t("scheduling")
                  : t("schedule")
                : submitting
                  ? t("sendingCode")
                  : t("sendCode")}
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
