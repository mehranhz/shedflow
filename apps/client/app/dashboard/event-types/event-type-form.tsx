"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

import { PageHeader } from "@/components/page-header";
import { useOrg } from "@/components/org-provider";
import { ClientApiError } from "@/lib/http";
import { defaultQuestions, slugify } from "@/lib/preview-store";
import { schedulingApi } from "@/lib/scheduling";
import type { EventType, LocationType } from "@/lib/types";

const DURATIONS = [15, 30, 45, 60];

const LOCATIONS: Array<{ value: LocationType; label: string }> = [
  { value: "GOOGLE_MEET", label: "Google Meet" },
  { value: "PHONE", label: "Phone call" },
  { value: "IN_PERSON", label: "In-person" },
  { value: "LINK", label: "Link" },
  { value: "CUSTOM", label: "Custom" },
];

export function EventTypeForm({ eventTypeId }: { eventTypeId?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { organization, profile } = useOrg();
  const existing = useQuery({
    queryKey: ["event-type", organization.id, eventTypeId],
    enabled: Boolean(eventTypeId),
    queryFn: () => schedulingApi.getEventType(organization, eventTypeId!, profile.id),
  });

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
  const [requiresConfirmation, setRequiresConfirmation] = useState(
    seed?.requiresConfirmation ?? false,
  );
  const [isActive, setIsActive] = useState(seed?.isActive ?? true);
  const [gated, setGated] = useState(false);

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
    setRequiresConfirmation(seed.requiresConfirmation);
    setIsActive(seed.isActive);
    if (!DURATIONS.includes(seed.durationMinutes)) {
      setCustomDuration(String(seed.durationMinutes));
    }
  }, [seed]);

  const mutation = useMutation({
    mutationFn: async () => {
      const minutes = customDuration ? Number(customDuration) : duration;
      const payload: Partial<EventType> & { title: string; durationMinutes: number } = {
        title,
        slug: slug || slugify(title),
        description,
        durationMinutes: minutes,
        locationType,
        locationValue: locationValue || null,
        minNoticeMinutes: minNotice,
        maxDaysAhead: maxDays,
        bufferBeforeMinutes: bufferBefore,
        bufferAfterMinutes: bufferAfter,
        requiresConfirmation,
        isActive,
        questions: seed?.questions ?? defaultQuestions(),
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
      toast.success(eventTypeId ? "Event type saved" : "Event type created");
      router.push("/dashboard/event-types");
    },
    onError: (error) => {
      if (error instanceof ClientApiError && error.code === "FEATURE_GATED") {
        setGated(true);
        return;
      }
      toast.error(error instanceof Error ? error.message : "Could not save event type");
    },
  });

  return (
    <form
      className="mx-auto max-w-3xl space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <PageHeader
        title={eventTypeId ? "Edit event type" : "New event type"}
        description="What event is this?"
        actions={
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending || !title}>
              {mutation.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        }
      />

      {gated ? (
        <Alert>
          <AlertTitle>Upgrade to Pro</AlertTitle>
          <AlertDescription>
            The Free plan includes 3 event types. Upgrade to publish more.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Event details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="title">Event name *</Label>
            <Input
              id="title"
              required
              value={title}
              placeholder="30 Minute Meeting"
              onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
                setTitle(event.target.value);
                if (!eventTypeId) {
                  setSlug(slugify(event.target.value));
                }
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="slug">Link</Label>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="hidden sm:inline">
                {typeof window === "undefined" ? "" : window.location.origin}/{organization.slug}/
              </span>
              <Input
                id="slug"
                value={slug}
                onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setSlug(slugify(event.target.value))}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Duration *</Label>
            <div className="flex flex-wrap gap-2">
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
                  {item} min
                </Button>
              ))}
              <Input
                className="w-28"
                inputMode="numeric"
                placeholder="Custom"
                value={customDuration}
                onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setCustomDuration(event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Location</Label>
            <Select
              value={locationType}
              onValueChange={(value: string) => setLocationType(value as LocationType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOCATIONS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {locationType !== "GOOGLE_MEET" && locationType !== "PHONE" ? (
              <Input
                value={locationValue}
                onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setLocationValue(event.target.value)}
                placeholder={
                  locationType === "IN_PERSON" ? "Address or room" : "https://"
                }
              />
            ) : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="description">Description/instructions</Label>
            <Textarea
              id="description"
              rows={4}
              value={description}
              onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDescription(event.target.value)}
              placeholder="What should invitees know before they book?"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Booking limits</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label>Minimum notice (minutes)</Label>
            <Input
              type="number"
              min={0}
              value={minNotice}
              onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setMinNotice(Number(event.target.value))}
            />
          </div>
          <div className="grid gap-2">
            <Label>Date range (days ahead)</Label>
            <Input
              type="number"
              min={1}
              value={maxDays}
              onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setMaxDays(Number(event.target.value))}
            />
          </div>
          <div className="grid gap-2">
            <Label>Buffer before (minutes)</Label>
            <Input
              type="number"
              min={0}
              value={bufferBefore}
              onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setBufferBefore(Number(event.target.value))}
            />
          </div>
          <div className="grid gap-2">
            <Label>Buffer after (minutes)</Label>
            <Input
              type="number"
              min={0}
              value={bufferAfter}
              onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setBufferAfter(Number(event.target.value))}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border px-3 py-2 sm:col-span-2">
            <div>
              <p className="text-sm font-medium">Require confirmation</p>
              <p className="text-xs text-muted-foreground">
                Hold the time until you approve the booking.
              </p>
            </div>
            <Switch
              checked={requiresConfirmation}
              onCheckedChange={setRequiresConfirmation}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border px-3 py-2 sm:col-span-2">
            <div>
              <p className="text-sm font-medium">On / Off</p>
              <p className="text-xs text-muted-foreground">
                Turn off to hide this event type from your public page.
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
