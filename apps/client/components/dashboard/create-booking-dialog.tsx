"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@shedflow/ui/components";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { useOrg } from "@/components/org-provider";
import { schedulingApi } from "@/lib/scheduling";

export function CreateBookingDialog() {
  const t = useTranslations("dashboard.bookings");
  const tc = useTranslations("dashboard.common");
  const { organization, profile } = useOrg();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [eventTypeId, setEventTypeId] = useState("");
  const [startLocal, setStartLocal] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const events = useQuery({
    queryKey: ["event-types", organization.id],
    queryFn: () => schedulingApi.listEventTypes(organization, profile.id),
  });

  const activeEvents = useMemo(
    () => (events.data?.data ?? []).filter((item) => item.isActive),
    [events.data],
  );

  const create = useMutation({
    mutationFn: async () => {
      if (!eventTypeId || !startLocal || !name.trim() || !email.trim()) {
        throw new Error(t("createRequired"));
      }
      const startAt = new Date(startLocal).toISOString();
      return schedulingApi.createHostBooking(organization, profile.id, {
        eventTypeId,
        startAt,
        timezone: organization.timezone,
        invitee: {
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bookings", organization.id] });
      await queryClient.invalidateQueries({ queryKey: ["customers", organization.id] });
      toast.success(t("created"));
      setOpen(false);
      setEventTypeId("");
      setStartLocal("");
      setName("");
      setEmail("");
      setPhone("");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t("createFailed"));
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          {t("newBooking")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("createTitle")}</DialogTitle>
          <DialogDescription>{t("createBody")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>{t("eventType")}</Label>
            <Select value={eventTypeId} onValueChange={setEventTypeId}>
              <SelectTrigger>
                <SelectValue placeholder={t("selectEventType")} />
              </SelectTrigger>
              <SelectContent>
                {activeEvents.map((event) => (
                  <SelectItem key={event.id} value={event.id}>
                    {event.title} · {tc("minutes", { count: event.durationMinutes })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="start">{t("startLabel", { timezone: organization.timezone })}</Label>
            <Input
              id="start"
              type="datetime-local"
              value={startLocal}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setStartLocal(event.target.value)
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="invitee-name">{t("inviteeName")}</Label>
            <Input
              id="invitee-name"
              value={name}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setName(event.target.value)
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="invitee-email">{t("inviteeEmail")}</Label>
            <Input
              id="invitee-email"
              type="email"
              value={email}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setEmail(event.target.value)
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="invitee-phone">{t("phoneOptional")}</Label>
            <Input
              id="invitee-phone"
              value={phone}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setPhone(event.target.value)
              }
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("cancelDialog")}
          </Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending ? t("creating") : t("createCta")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
