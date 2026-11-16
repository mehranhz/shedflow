"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Input,
  Label,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Textarea,
} from "@shedflow/ui/components";

import { SlotPicker } from "@/components/booking/slot-picker";
import { usePortalBusiness } from "@/components/portal/portal-business-context";
import { PortalEmptyState, PortalErrorState, PortalSkeleton } from "@/components/portal/portal-states";
import { ClientApiError } from "@/lib/http";
import {
  addCustomerAttachment,
  cancelCustomerBooking,
  fetchCustomerBooking,
  fetchCustomerMe,
  saveCustomerNote,
  type CustomerBookingDetail,
} from "@/lib/portal/customer-api";
import { downloadIcs } from "@/lib/portal/ics";
import { formatRelativeInZone } from "@/lib/portal/multi-business";
import type { LocationType, PublicEventType, PublicOrg } from "@/lib/types";
import { randomUUID } from "@/lib/uuid";

export function PortalAppointmentDetail({ uid }: { uid: string }) {
  const t = useTranslations("portal.appointments");
  const { data: session } = useSession();
  const { activeBusiness } = usePortalBusiness();
  const queryClient = useQueryClient();
  const customerOrgId =
    activeBusiness?.organizationId ?? session?.customerOrgId ?? undefined;
  const profile = useQuery({
    queryKey: ["customer-me", customerOrgId],
    queryFn: () => fetchCustomerMe(customerOrgId),
    enabled: Boolean(customerOrgId),
    retry: false,
  });
  const booking = useQuery({
    queryKey: ["customer-booking", customerOrgId, uid],
    queryFn: () => fetchCustomerBooking(customerOrgId!, uid),
    enabled: Boolean(customerOrgId),
    retry: false,
  });

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["customer-bookings"] }),
      queryClient.invalidateQueries({ queryKey: ["customer-home"] }),
      queryClient.invalidateQueries({ queryKey: ["customer-booking", customerOrgId, uid] }),
    ]);
  };

  if (!customerOrgId || booking.isLoading) {
    return <PortalSkeleton rows={4} />;
  }
  if (booking.isError) {
    const missing = booking.error instanceof ClientApiError && booking.error.status === 404;
    if (missing) {
      return <PortalEmptyState title={t("notFoundTitle")} description={t("notFoundBody")} />;
    }
    return (
      <PortalErrorState
        message={booking.error instanceof Error ? booking.error.message : t("loadFailed")}
        onRetry={() => void booking.refetch()}
      />
    );
  }
  if (!booking.data) {
    return <PortalEmptyState title={t("notFoundTitle")} description={t("notFoundBody")} />;
  }

  return (
    <DetailBody
      booking={booking.data}
      customerOrgId={customerOrgId}
      profileTimeZone={profile.data?.user.timezone}
      onChanged={invalidate}
    />
  );
}

function DetailBody({
  booking,
  customerOrgId,
  profileTimeZone,
  onChanged,
}: {
  booking: CustomerBookingDetail;
  customerOrgId: string;
  profileTimeZone?: string;
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations("portal.appointments");
  const router = useRouter();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [scope, setScope] = useState<"single" | "this_and_future">("single");
  const [note, setNote] = useState(booking.customerNote ?? "");
  const [attachment, setAttachment] = useState({
    url: "",
    name: "",
    mimeType: "application/pdf",
    sizeBytes: "1024",
  });

  useEffect(() => {
    setNote(booking.customerNote ?? "");
  }, [booking.uid, booking.customerNote]);

  const started = new Date(booking.startAt).getTime() <= Date.now();
  const readOnly =
    started ||
    booking.status === "CANCELLED" ||
    booking.status === "NO_SHOW" ||
    booking.status === "RESCHEDULED" ||
    booking.status === "EXPIRED";
  const policy = booking.policy;
  const eventSlug = booking.eventType?.slug;

  const cancel = useMutation({
    mutationFn: () =>
      cancelCustomerBooking(
        customerOrgId,
        booking.uid,
        { reason: reason.trim() || undefined, scope: booking.seriesId ? scope : "single" },
        randomUUID(),
      ),
    onSuccess: async () => {
      setCancelOpen(false);
      await onChanged();
    },
    onError: (error) => {
      toast.error(conflictMessage(error, t));
    },
  });

  const noteSave = useMutation({
    mutationFn: () => saveCustomerNote(customerOrgId, booking.uid, note),
    onSuccess: () => void onChanged(),
    onError: (error) => toast.error(error instanceof Error ? error.message : t("loadFailed")),
  });

  const attachmentSave = useMutation({
    mutationFn: () =>
      addCustomerAttachment(customerOrgId, booking.uid, {
        url: attachment.url.trim(),
        name: attachment.name.trim(),
        mimeType: attachment.mimeType,
        sizeBytes: Number(attachment.sizeBytes),
      }),
    onSuccess: async () => {
      setAttachment({ url: "", name: "", mimeType: "application/pdf", sizeBytes: "1024" });
      await onChanged();
    },
    onError: (error) => toast.error(fieldOrMessage(error, t("loadFailed"))),
  });

  return (
    <section className="space-y-4" aria-labelledby="appointment-detail-heading">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 id="appointment-detail-heading" className="text-2xl font-semibold tracking-tight">
            {booking.title ?? t("appointmentFallback")}
          </h1>
          <Badge>{booking.status}</Badge>
        </div>
        {booking.seriesId ? (
          <p className="text-sm text-muted-foreground">{t("seriesHint")}</p>
        ) : null}
        {booking.status === "NO_SHOW" ? (
          <p className="text-sm">{t("noShowHint")}</p>
        ) : null}
        {booking.status === "CANCELLED" ? (
          <p className="text-sm">{t("cancelledHint")}</p>
        ) : null}
      </div>

      <dl className="grid gap-3 text-sm">
        <div>
          <dt className="text-muted-foreground">{t("when")}</dt>
          <dd>{formatRelativeInZone(booking.startAt, booking.timezone)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("where")}</dt>
          <dd>{booking.locationValue || booking.locationType || "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("host")}</dt>
          <dd>{booking.hostName || "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("receipt")}</dt>
          <dd>
            {receiptLabel(booking, t)}
            {booking.receipt?.rejectionReason ? ` — ${booking.receipt.rejectionReason}` : ""}
          </dd>
        </div>
        {policy ? (
          <div>
            <dt className="text-muted-foreground">{t("policy")}</dt>
            <dd>
              {t("cancelDeadline", { hours: policy.cancellationNoticeHours })}{" "}
              {t("rescheduleDeadline", { hours: policy.rescheduleNoticeHours })}{" "}
              {policy.noShowPolicySummary}
            </dd>
          </div>
        ) : null}
        {answerRows(booking.answers).length > 0 ? (
          <div>
            <dt className="text-muted-foreground">{t("answers")}</dt>
            <dd>
              <ul className="space-y-1">
                {answerRows(booking.answers).map((row) => (
                  <li key={row.key}>
                    <span className="text-muted-foreground">{row.key}: </span>
                    {row.value}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="flex flex-wrap gap-2">
        {!readOnly && policy?.canCancel ? (
          <Button type="button" variant="outline" onClick={() => setCancelOpen(true)}>
            {t("cancel")}
          </Button>
        ) : null}
        {!readOnly && policy && !policy.canCancel && policy.cancelBlockedReason === "OUTSIDE_POLICY" ? (
          <Button type="button" variant="outline" disabled>
            {t("cancel")}
          </Button>
        ) : null}
        {!readOnly && policy?.canReschedule ? (
          <Button type="button" variant="outline" onClick={() => setRescheduleOpen((open) => !open)}>
            {t("reschedule")}
          </Button>
        ) : null}
        {!readOnly && policy && !policy.canReschedule && policy.rescheduleBlockedReason === "OUTSIDE_POLICY" ? (
          <Button type="button" variant="outline" disabled>
            {t("reschedule")}
          </Button>
        ) : null}
        {eventSlug ? (
          <Button variant="outline" asChild>
            <Link href={`/portal/book/${encodeURIComponent(eventSlug)}`}>{t("bookAgain")}</Link>
          </Button>
        ) : null}
        {booking.endAt ? (
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              downloadIcs({
                uid: booking.uid,
                title: booking.title ?? t("appointmentFallback"),
                startAt: booking.startAt,
                endAt: booking.endAt!,
                location: booking.locationValue,
              })
            }
          >
            {t("addToCalendar")}
          </Button>
        ) : null}
        {booking.receipt?.status === "REJECTED" || booking.receiptStatus === "REJECTED" ? (
          <Button variant="outline" asChild>
            <Link href={`/b/${encodeURIComponent(booking.uid)}/pay`}>{t("reupload")}</Link>
          </Button>
        ) : null}
      </div>

      {!readOnly && policy && !policy.canCancel && policy.cancelBlockedReason === "OUTSIDE_POLICY" ? (
        <Alert variant="destructive">
          <AlertDescription>{t("outsidePolicy")}</AlertDescription>
        </Alert>
      ) : null}

      {rescheduleOpen && eventSlug && booking.organization?.slug ? (
        <SlotPicker
          orgSlug={booking.organization.slug}
          eventSlug={eventSlug}
          eventType={toPublicEvent(booking)}
          organization={toPublicOrg(booking)}
          defaultTimeZone={profileTimeZone}
          reschedule={{
            bookingUid: booking.uid,
            customerOrgId,
            onRescheduled: async (result) => {
              setRescheduleOpen(false);
              await onChanged();
              if (result.uid && result.uid !== booking.uid) {
                router.push(`/portal/appointments/${encodeURIComponent(result.uid)}`);
              }
            },
          }}
        />
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="customer-note">{t("noteTitle")}</Label>
        <Textarea
          id="customer-note"
          value={note}
          placeholder={t("notePlaceholder")}
          disabled={!booking.customerNoteEditable}
          onChange={(event) => setNote(event.target.value)}
        />
        {booking.customerNoteEditable ? (
          <Button type="button" size="sm" disabled={noteSave.isPending} onClick={() => noteSave.mutate()}>
            {t("noteSave")}
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">{t("noteLocked")}</p>
        )}
      </div>

      {readOnly ? (
        <div className="space-y-2 rounded-lg border border-dashed p-4">
          <h2 className="font-medium">{t("attachmentTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("attachmentReadOnly")}</p>
          {booking.attachments && booking.attachments.length > 0 ? (
            <ul className="text-sm">
              {booking.attachments.map((item) => (
                <li key={item.url}>
                  <a href={item.url} className="underline" target="_blank" rel="noopener noreferrer">
                    {item.name}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {!readOnly ? (
      <form
        className="space-y-3 rounded-lg border p-4"
        onSubmit={(event) => {
          event.preventDefault();
          attachmentSave.mutate();
        }}
      >
        <div>
          <h2 className="font-medium">{t("attachmentTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("attachmentHelp")}</p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="attachment-url">{t("attachmentUrl")}</Label>
          <Input
            id="attachment-url"
            type="url"
            value={attachment.url}
            onChange={(event) => setAttachment((current) => ({ ...current, url: event.target.value }))}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="attachment-name">{t("attachmentName")}</Label>
          <Input
            id="attachment-name"
            value={attachment.name}
            onChange={(event) => setAttachment((current) => ({ ...current, name: event.target.value }))}
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="attachment-mime">{t("attachmentMime")}</Label>
            <Input
              id="attachment-mime"
              value={attachment.mimeType}
              onChange={(event) =>
                setAttachment((current) => ({ ...current, mimeType: event.target.value }))
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="attachment-size">{t("attachmentSize")}</Label>
            <Input
              id="attachment-size"
              inputMode="numeric"
              value={attachment.sizeBytes}
              onChange={(event) =>
                setAttachment((current) => ({ ...current, sizeBytes: event.target.value }))
              }
            />
          </div>
        </div>
        <Button type="submit" size="sm" disabled={attachmentSave.isPending}>
          {t("attachmentSave")}
        </Button>
        {booking.attachments && booking.attachments.length > 0 ? (
          <ul className="text-sm">
            {booking.attachments.map((item) => (
              <li key={item.url}>
                <a href={item.url} className="underline" target="_blank" rel="noopener noreferrer">
                  {item.name}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </form>
      ) : null}

      <Sheet open={cancelOpen} onOpenChange={setCancelOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{t("cancelTitle")}</SheetTitle>
          </SheetHeader>
          <form
            className="mt-4 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              cancel.mutate();
            }}
          >
            {policy ? (
              <p className="text-sm text-muted-foreground">
                {t("cancelDeadline", { hours: policy.cancellationNoticeHours })}
              </p>
            ) : null}
            {booking.seriesId ? (
              <fieldset className="space-y-2 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="cancel-scope"
                    checked={scope === "single"}
                    onChange={() => setScope("single")}
                  />
                  {t("cancelOne")}
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="cancel-scope"
                    checked={scope === "this_and_future"}
                    onChange={() => setScope("this_and_future")}
                  />
                  {t("cancelFuture")}
                </label>
              </fieldset>
            ) : null}
            <div className="grid gap-2">
              <Label htmlFor="cancel-reason">{t("cancelReason")}</Label>
              <Textarea
                id="cancel-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
            <Button type="submit" disabled={cancel.isPending}>
              {t("cancelConfirm")}
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </section>
  );
}

function toPublicEvent(booking: CustomerBookingDetail): PublicEventType {
  return {
    slug: booking.eventType?.slug ?? "event",
    title: booking.title ?? booking.eventType?.title ?? "Appointment",
    description: booking.description ?? "",
    durationMinutes: booking.durationMinutes ?? 30,
    locationType: (booking.locationType ?? "CUSTOM") as LocationType,
    locationValue: booking.locationValue ?? null,
    questions: [],
    requiresConfirmation: Boolean(booking.requiresConfirmation),
    requiresPaymentReceipt: booking.requiresPaymentReceipt,
    paymentInstructions: booking.paymentInstructions,
    price: null,
  };
}

function toPublicOrg(booking: CustomerBookingDetail): PublicOrg {
  return {
    name: booking.organization?.name ?? "Business",
    slug: booking.organization?.slug ?? "org",
    logoUrl: null,
    brandColor: booking.organization?.brandColor ?? null,
    locale: "en",
    timezone: booking.timezone,
  };
}

function answerRows(
  answers: Record<string, unknown> | undefined,
): Array<{ key: string; value: string }> {
  if (!answers) {
    return [];
  }
  return Object.entries(answers).flatMap(([key, value]) => {
    if (value == null || value === "") {
      return [];
    }
    return [{ key, value: formatAnswerValue(value) }];
  });
}

function formatAnswerValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (typeof value === "number") {
    return String(value);
  }
  return JSON.stringify(value);
}

function receiptLabel(
  booking: CustomerBookingDetail,
  t: (key: "receiptNone" | "receiptUnderReview" | "receiptRejected" | "receiptApproved") => string,
): string {
  const status = booking.receipt?.status ?? booking.receiptStatus;
  if (!status) {
    return t("receiptNone");
  }
  if (status === "UPLOADED") {
    return t("receiptUnderReview");
  }
  if (status === "REJECTED") {
    return t("receiptRejected");
  }
  if (status === "APPROVED") {
    return t("receiptApproved");
  }
  return status;
}

function conflictMessage(
  error: unknown,
  t: (key: "outsidePolicy" | "slotUnavailable" | "conflict" | "loadFailed") => string,
): string {
  if (error instanceof ClientApiError) {
    if (error.code === "OUTSIDE_POLICY") return t("outsidePolicy");
    if (error.code === "SLOT_UNAVAILABLE") return t("slotUnavailable");
    if (error.code === "CONFLICT" || error.status === 409) return t("conflict");
    return error.message;
  }
  return t("loadFailed");
}

function fieldOrMessage(error: unknown, fallback: string): string {
  if (error instanceof ClientApiError) {
    const details = error.details;
    if (details && typeof details === "object" && "fieldErrors" in details) {
      const fields = (details as { fieldErrors?: Record<string, string[]> }).fieldErrors;
      const text = fields ? Object.values(fields).flat().join(" ") : "";
      if (text) return text;
    }
    return error.message || fallback;
  }
  return error instanceof Error ? error.message : fallback;
}
