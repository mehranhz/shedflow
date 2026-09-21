"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { EventTypeQuestionsSchema } from "@shedflow/shared";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from "@shedflow/ui/components";
import { toast } from "sonner";

import { EventTypeSharePanel } from "@/components/dashboard/event-type-share-panel";
import { PageHeader } from "@/components/page-header";
import { useOrg } from "@/components/org-provider";
import { ClientApiError } from "@/lib/http";
import { defaultQuestions, slugify } from "@/lib/preview-store";
import { schedulingApi } from "@/lib/scheduling";
import type { EventType, LocationType, Question } from "@/lib/types";

const DURATIONS = [15, 30, 45, 60];

const LOCATION_VALUES: LocationType[] = [
  "GOOGLE_MEET",
  "PHONE",
  "IN_PERSON",
  "LINK",
  "CUSTOM",
];

export function EventTypeForm({ eventTypeId }: { eventTypeId?: string }) {
  const t = useTranslations("dashboard.eventTypes");
  const tf = useTranslations("dashboard.eventTypes.form");
  const router = useRouter();
  const queryClient = useQueryClient();
  const { organization, profile } = useOrg();
  const isPro = organization.platformPlan === "PRO";
  const isCreate = !eventTypeId;

  const listQuery = useQuery({
    queryKey: ["event-types", organization.id],
    queryFn: () => schedulingApi.listEventTypes(organization, profile.id),
  });

  const existing = useQuery({
    queryKey: ["event-type", organization.id, eventTypeId],
    enabled: Boolean(eventTypeId),
    queryFn: () => schedulingApi.getEventType(organization, eventTypeId!, profile.id),
  });

  const activeCount = useMemo(
    () => (listQuery.data?.data ?? []).filter((item) => item.isActive).length,
    [listQuery.data],
  );
  const freeLimitReached =
    isCreate && !isPro && activeCount >= 3;

  const seed = existing.data?.data;
  const [title, setTitle] = useState(seed?.title ?? "");
  const [slug, setSlug] = useState(seed?.slug ?? "");
  const [description, setDescription] = useState(seed?.description ?? "");
  const [duration, setDuration] = useState(seed?.durationMinutes ?? 30);
  const [customDuration, setCustomDuration] = useState(
    seed && !DURATIONS.includes(seed.durationMinutes)
      ? String(seed.durationMinutes)
      : "",
  );
  const [locationType, setLocationType] = useState<LocationType>(
    seed?.locationType ?? "GOOGLE_MEET",
  );
  const [locationValue, setLocationValue] = useState(seed?.locationValue ?? "");
  const [minNotice, setMinNotice] = useState(seed?.minNoticeMinutes ?? 60);
  const [maxDays, setMaxDays] = useState(seed?.maxDaysAhead ?? 60);
  const [bufferBefore, setBufferBefore] = useState(seed?.bufferBeforeMinutes ?? 0);
  const [bufferAfter, setBufferAfter] = useState(seed?.bufferAfterMinutes ?? 0);
  const [slotInterval, setSlotInterval] = useState(seed?.slotIntervalMinutes ?? 0);
  const [dailyCap, setDailyCap] = useState(
    seed?.dailyCap != null ? String(seed.dailyCap) : "",
  );
  const [cancellationNotice, setCancellationNotice] = useState(
    seed?.cancellationNoticeHours ?? 24,
  );
  const [rescheduleNotice, setRescheduleNotice] = useState(
    seed?.rescheduleNoticeHours ?? 24,
  );
  const [creditCost, setCreditCost] = useState(seed?.creditCost ?? 0);
  const [requiresConfirmation, setRequiresConfirmation] = useState(
    seed?.requiresConfirmation ?? false,
  );
  const [isActive, setIsActive] = useState(seed?.isActive ?? true);
  const [isHidden, setIsHidden] = useState(seed?.isHidden ?? false);
  const [questionsJson, setQuestionsJson] = useState(
    JSON.stringify(seed?.questions ?? defaultQuestions(), null, 2),
  );
  const [gated, setGated] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  useEffect(() => {
    if (!seed) {
      return;
    }
    setTitle(seed.title);
    setSlug(seed.slug);
    setDescription(seed.description);
    setDuration(seed.durationMinutes);
    setLocationType(seed.locationType);
    setLocationValue(seed.locationValue ?? "");
    setMinNotice(seed.minNoticeMinutes);
    setMaxDays(seed.maxDaysAhead);
    setBufferBefore(seed.bufferBeforeMinutes);
    setBufferAfter(seed.bufferAfterMinutes);
    setSlotInterval(seed.slotIntervalMinutes);
    setDailyCap(seed.dailyCap != null ? String(seed.dailyCap) : "");
    setCancellationNotice(seed.cancellationNoticeHours);
    setRescheduleNotice(seed.rescheduleNoticeHours);
    setCreditCost(seed.creditCost);
    setRequiresConfirmation(seed.requiresConfirmation);
    setIsActive(seed.isActive);
    setIsHidden(seed.isHidden);
    setQuestionsJson(JSON.stringify(seed.questions ?? defaultQuestions(), null, 2));
    if (!DURATIONS.includes(seed.durationMinutes)) {
      setCustomDuration(String(seed.durationMinutes));
    }
  }, [seed]);

  useEffect(() => {
    if (freeLimitReached) {
      setGated(true);
    }
  }, [freeLimitReached]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (freeLimitReached) {
        throw new ClientApiError(tf("freeLimitBody"), 403, "FEATURE_GATED");
      }
      const minutes = customDuration ? Number(customDuration) : duration;
      if (!Number.isFinite(minutes) || minutes < 1 || minutes > 24 * 60) {
        throw new Error(tf("durationRange"));
      }
      if (!title.trim()) {
        throw new Error(tf("nameRequired"));
      }
      let questions: Question[];
      try {
        const parsed = JSON.parse(questionsJson) as unknown;
        questions = EventTypeQuestionsSchema.parse(parsed);
      } catch {
        throw new Error(tf("questionsInvalid"));
      }
      setFieldError(null);
      const payload: Partial<EventType> & { title: string; durationMinutes: number } = {
        title: title.trim(),
        slug: slug || slugify(title),
        description,
        durationMinutes: minutes,
        locationType,
        locationValue: locationValue || null,
        minNoticeMinutes: minNotice,
        maxDaysAhead: maxDays,
        bufferBeforeMinutes: bufferBefore,
        bufferAfterMinutes: bufferAfter,
        slotIntervalMinutes: slotInterval,
        dailyCap: dailyCap.trim() ? Number(dailyCap) : null,
        cancellationNoticeHours: cancellationNotice,
        rescheduleNoticeHours: rescheduleNotice,
        requiresConfirmation,
        isActive,
        isHidden,
        questions,
        creditCost: isPro ? creditCost : 0,
        // Stripe catalog ids stay unset on Free; Pro attaches them in Billing (T-032).
        priceId: isPro ? seed?.priceId ?? null : null,
        subscriptionProductId: isPro ? seed?.subscriptionProductId ?? null : null,
      };
      if (eventTypeId) {
        return schedulingApi.updateEventType(
          organization,
          profile.id,
          eventTypeId,
          payload,
        );
      }
      return schedulingApi.createEventType(organization, profile.id, payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["event-types", organization.id] });
      toast.success(eventTypeId ? tf("saved") : tf("created"));
      router.push("/dashboard/event-types");
    },
    onError: (error) => {
      if (error instanceof ClientApiError && error.code === "FEATURE_GATED") {
        setGated(true);
        return;
      }
      const message = error instanceof Error ? error.message : tf("saveFailed");
      setFieldError(message);
      toast.error(message);
    },
  });

  const origin =
    typeof window === "undefined" ? APP_ORIGIN_FALLBACK : window.location.origin;

  return (
    <form
      className="mx-auto max-w-3xl space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <PageHeader
        title={eventTypeId ? tf("editTitle") : tf("newTitle")}
        description={tf("description")}
        actions={
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              {tf("cancel")}
            </Button>
            <Button
              type="submit"
              disabled={mutation.isPending || !title || freeLimitReached}
            >
              {mutation.isPending ? tf("saving") : tf("save")}
            </Button>
          </div>
        }
      />

      {gated || freeLimitReached ? (
        <Alert>
          <AlertTitle>{tf("upgradeTitle")}</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{tf("freeLimitAlert")}</span>
            <Button asChild size="sm" className="shrink-0">
              <Link href="/dashboard/billing">{tf("upgradeCta")}</Link>
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {fieldError ? (
        <Alert variant="destructive">
          <AlertTitle>{tf("saveErrorTitle")}</AlertTitle>
          <AlertDescription>{fieldError}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{tf("detailsTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="title">{tf("name")}</Label>
            <Input
              id="title"
              required
              value={title}
              placeholder={tf("namePlaceholder")}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setTitle(event.target.value);
                if (!eventTypeId) {
                  setSlug(slugify(event.target.value));
                }
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="slug">{tf("link")}</Label>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="hidden truncate sm:inline">
                {origin}/{organization.slug}/
              </span>
              <Input
                id="slug"
                value={slug}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setSlug(slugify(event.target.value))
                }
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label id="et-duration-label">{tf("duration")}</Label>
            <div className="flex flex-wrap gap-2" role="group" aria-labelledby="et-duration-label">
              {DURATIONS.map((item) => (
                <Button
                  key={item}
                  type="button"
                  variant={duration === item && !customDuration ? "default" : "outline"}
                  onClick={() => {
                    setDuration(item);
                    setCustomDuration("");
                  }}
                >
                  {tf("minutesShort", { count: item })}
                </Button>
              ))}
              <Input
                id="et-custom-duration"
                className="w-28"
                inputMode="numeric"
                aria-label={tf("customDuration")}
                placeholder={tf("customDuration")}
                value={customDuration}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setCustomDuration(event.target.value)
                }
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="et-location">{tf("location")}</Label>
            <Select
              value={locationType}
              onValueChange={(value: string) => setLocationType(value as LocationType)}
            >
              <SelectTrigger id="et-location">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOCATION_VALUES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`locations.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {locationType !== "GOOGLE_MEET" && locationType !== "PHONE" ? (
              <Input
                value={locationValue}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setLocationValue(event.target.value)
                }
                placeholder={
                  locationType === "IN_PERSON"
                    ? tf("addressPlaceholder")
                    : "https://"
                }
              />
            ) : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="description">{tf("descriptionLabel")}</Label>
            <Textarea
              id="description"
              rows={4}
              value={description}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                setDescription(event.target.value)
              }
              placeholder={tf("descriptionPlaceholder")}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{tf("limitsTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="et-min-notice">{tf("minNotice")}</Label>
            <Input
              id="et-min-notice"
              type="number"
              min={0}
              value={minNotice}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setMinNotice(Number(event.target.value))
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="et-date-range">{tf("dateRange")}</Label>
            <Input
              id="et-date-range"
              type="number"
              min={1}
              value={maxDays}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setMaxDays(Number(event.target.value))
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="et-buffer-before">{tf("bufferBefore")}</Label>
            <Input
              id="et-buffer-before"
              type="number"
              min={0}
              value={bufferBefore}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setBufferBefore(Number(event.target.value))
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="et-buffer-after">{tf("bufferAfter")}</Label>
            <Input
              id="et-buffer-after"
              type="number"
              min={0}
              value={bufferAfter}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setBufferAfter(Number(event.target.value))
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="et-slot-interval">{tf("slotInterval")}</Label>
            <Input
              id="et-slot-interval"
              type="number"
              min={0}
              value={slotInterval}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setSlotInterval(Number(event.target.value))
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="et-daily-cap">{tf("dailyCap")}</Label>
            <Input
              id="et-daily-cap"
              type="number"
              min={1}
              value={dailyCap}
              placeholder={tf("unlimited")}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setDailyCap(event.target.value)
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="et-cancel-notice">{tf("cancelNotice")}</Label>
            <Input
              id="et-cancel-notice"
              type="number"
              min={0}
              value={cancellationNotice}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setCancellationNotice(Number(event.target.value))
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="et-reschedule-notice">{tf("rescheduleNotice")}</Label>
            <Input
              id="et-reschedule-notice"
              type="number"
              min={0}
              value={rescheduleNotice}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setRescheduleNotice(Number(event.target.value))
              }
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border px-3 py-2 sm:col-span-2">
            <div>
              <p className="text-sm font-medium">{tf("requireConfirmation")}</p>
              <p className="text-xs text-muted-foreground">
                {tf("requireConfirmationHint")}
              </p>
            </div>
            <Switch
              checked={requiresConfirmation}
              onCheckedChange={setRequiresConfirmation}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border px-3 py-2 sm:col-span-2">
            <div>
              <p className="text-sm font-medium">{tf("onOff")}</p>
              <p className="text-xs text-muted-foreground">{tf("onOffHint")}</p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
          <div className="flex items-center justify-between rounded-lg border px-3 py-2 sm:col-span-2">
            <div>
              <p className="text-sm font-medium">{tf("hideFromProfile")}</p>
              <p className="text-xs text-muted-foreground">
                {tf("hideFromProfileHint", { slug: organization.slug })}
              </p>
            </div>
            <Switch checked={isHidden} onCheckedChange={setIsHidden} />
          </div>
        </CardContent>
      </Card>

      {isPro ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{tf("paymentsTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <p className="text-sm text-muted-foreground">{tf("paymentsHint")}</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="et-credit-cost">{tf("creditCost")}</Label>
              <Input
                id="et-credit-cost"
                type="number"
                min={0}
                value={creditCost}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setCreditCost(Number(event.target.value))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="et-price-id">{tf("priceId")}</Label>
              <Input
                id="et-price-id"
                value={seed?.priceId ?? ""}
                disabled
                placeholder={tf("pricePlaceholder")}
              />
            </div>
          </CardContent>
        </Card>
      ) : (
        <Alert>
          <AlertTitle>{tf("paidProTitle")}</AlertTitle>
          <AlertDescription>
            {tf("paidProAlert")}{" "}
            <Link href="/dashboard/billing" className="underline underline-offset-2">
              {tf("viewBilling")}
            </Link>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{tf("questionsTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          <Label htmlFor="questions">{tf("questionsLabel")}</Label>
          <Textarea
            id="questions"
            rows={8}
            className="font-mono text-xs"
            value={questionsJson}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
              setQuestionsJson(event.target.value)
            }
          />
        </CardContent>
      </Card>

      {slug ? (
        <EventTypeSharePanel orgSlug={organization.slug} eventSlug={slug} />
      ) : null}
    </form>
  );
}

const APP_ORIGIN_FALLBACK = "http://localhost:3000";
