"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  Button,
  Calendar,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Switch,
} from "@shedflow/ui/components";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

import { PageHeader } from "@/components/page-header";
import { TimezoneCombobox } from "@/components/timezone-combobox";
import { useOrg } from "@/components/org-provider";
import { QueryError, TableSkeleton } from "@/components/query-state";
import { orgsApi, schedulingApi } from "@/lib/scheduling";
import { formatMinute, minuteToInput, parseTimeToMinute } from "@/lib/slots";
import type { AvailabilityRule } from "@/lib/types";

const DAY_KEYS = ["0", "1", "2", "3", "4", "5", "6"] as const;

type DayRow = {
  enabled: boolean;
  windows: Array<{ startMinute: number; endMinute: number }>;
};

function rulesToRows(rules: AvailabilityRule[]): DayRow[] {
  return DAY_KEYS.map((_, dayOfWeek) => {
    const windows = rules
      .filter((rule) => rule.dayOfWeek === dayOfWeek)
      .map((rule) => ({ startMinute: rule.startMinute, endMinute: rule.endMinute }));
    return {
      enabled: windows.length > 0,
      windows: windows.length > 0 ? windows : [{ startMinute: 9 * 60, endMinute: 17 * 60 }],
    };
  });
}

function rowsToRules(rows: DayRow[]): AvailabilityRule[] {
  return rows.flatMap((row, dayOfWeek) =>
    row.enabled
      ? row.windows.map((window) => ({
          dayOfWeek,
          startMinute: window.startMinute,
          endMinute: window.endMinute,
        }))
      : [],
  );
}

export function AvailabilityEditor() {
  const t = useTranslations("dashboard.availability");
  const tc = useTranslations("dashboard.common");
  const { organization, profile, role } = useOrg();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["schedules", organization.id],
    queryFn: () => schedulingApi.listSchedules(organization, profile.id),
  });
  const schedule = query.data?.data.find((item) => item.isDefault) ?? query.data?.data[0];
  const [rows, setRows] = useState<DayRow[] | null>(null);
  const [timezone, setTimezone] = useState(organization.timezone);
  const [overrideDate, setOverrideDate] = useState<Date | undefined>();
  const [overrideStart, setOverrideStart] = useState("10:00");
  const [overrideEnd, setOverrideEnd] = useState("14:00");

  useEffect(() => {
    if (schedule && !rows) {
      setRows(rulesToRows(schedule.rules ?? []));
      setTimezone(schedule.timezone);
    }
  }, [schedule, rows]);

  const save = useMutation({
    mutationFn: async () => {
      if (!schedule || !rows) {
        return;
      }
      for (const row of rows) {
        if (!row.enabled) continue;
        for (const window of row.windows) {
          if (window.endMinute <= window.startMinute) {
            throw new Error(t("windowInvalid"));
          }
        }
      }
      await schedulingApi.replaceRules(
        organization,
        profile.id,
        schedule.id,
        rowsToRules(rows),
      );
      if (timezone !== schedule.timezone) {
        await schedulingApi.updateSchedule(organization, profile.id, schedule.id, {
          timezone,
        });
      }
      if (timezone !== organization.timezone && role === "OWNER") {
        await orgsApi.update(organization.id, { timezone });
      }
    },
    onSuccess: async () => {
      setRows(null);
      await queryClient.invalidateQueries({ queryKey: ["schedules", organization.id] });
      toast.success(t("saved"));
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t("saveFailed"));
    },
  });

  const addOverride = useMutation({
    mutationFn: async (unavailable: boolean) => {
      if (!schedule || !overrideDate) {
        return;
      }
      const date = format(overrideDate, "yyyy-MM-dd");
      const startMinute = parseTimeToMinute(overrideStart);
      const endMinute = parseTimeToMinute(overrideEnd);
      if (!unavailable) {
        if (startMinute == null || endMinute == null) {
          throw new Error(t("customInvalid"));
        }
        if (endMinute <= startMinute) {
          throw new Error(t("customOrder"));
        }
      }
      await schedulingApi.upsertOverride(organization, profile.id, schedule.id, date, {
        isUnavailable: unavailable,
        startMinute: unavailable ? null : startMinute,
        endMinute: unavailable ? null : endMinute,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["schedules", organization.id] });
      toast.success(t("overrideSaved"));
      setOverrideDate(undefined);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t("overrideFailed"));
    },
  });

  const removeOverride = useMutation({
    mutationFn: async (date: string) => {
      if (!schedule) {
        return;
      }
      await schedulingApi.deleteOverride(organization, profile.id, schedule.id, date);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["schedules", organization.id] });
      toast.success(t("overrideRemoved"));
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t("removeFailed"));
    },
  });

  const editor = rows ?? rulesToRows(schedule?.rules ?? []);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button onClick={() => save.mutate()} disabled={save.isPending || !schedule}>
            {save.isPending ? tc("saving") : t("saveShort")}
          </Button>
        }
      />

      {query.isLoading ? <TableSkeleton /> : null}
      {query.error ? (
        <QueryError
          message={
            query.error instanceof Error ? query.error.message : t("loadFailed")
          }
          onRetry={() => void query.refetch()}
        />
      ) : null}

      {!query.isLoading && !schedule ? (
        <p className="text-sm text-muted-foreground">{t("noSchedule")}</p>
      ) : null}

      {schedule ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <Card>
            <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base">{schedule.name}</CardTitle>
              <TimezoneCombobox
                value={timezone}
                onChange={setTimezone}
                className="w-full sm:w-[260px]"
              />
            </CardHeader>
            <CardContent className="divide-y">
              {DAY_KEYS.map((dayKey, index) => {
                const row = editor[index];
                return (
                  <div key={dayKey} className="grid gap-3 py-4 sm:grid-cols-[140px_1fr]">
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={row.enabled}
                        onCheckedChange={(enabled: boolean) => {
                          setRows((current) => {
                            const next = [...(current ?? editor)];
                            next[index] = { ...next[index], enabled };
                            return next;
                          });
                        }}
                      />
                      <span className="text-sm font-medium">{t(`days.${dayKey}`)}</span>
                    </div>
                    {row.enabled ? (
                      <div className="space-y-2">
                        {row.windows.map((window, windowIndex) => (
                          <div key={windowIndex} className="flex flex-wrap items-center gap-2">
                            <Input
                              className="w-28"
                              type="time"
                              aria-label={t("windowStart", {
                                day: t(`days.${dayKey}`),
                              })}
                              value={minuteToInput(window.startMinute)}
                              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                                const minute = parseTimeToMinute(event.target.value);
                                if (minute == null) return;
                                setRows((current) => {
                                  const next = [...(current ?? editor)];
                                  const windows = [...next[index].windows];
                                  windows[windowIndex] = {
                                    ...windows[windowIndex],
                                    startMinute: minute,
                                  };
                                  next[index] = { ...next[index], windows };
                                  return next;
                                });
                              }}
                            />
                            <span className="text-muted-foreground">–</span>
                            <Input
                              className="w-28"
                              type="time"
                              aria-label={t("windowEnd", {
                                day: t(`days.${dayKey}`),
                              })}
                              value={minuteToInput(window.endMinute)}
                              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                                const minute = parseTimeToMinute(event.target.value);
                                if (minute == null) return;
                                setRows((current) => {
                                  const next = [...(current ?? editor)];
                                  const windows = [...next[index].windows];
                                  windows[windowIndex] = {
                                    ...windows[windowIndex],
                                    endMinute: minute,
                                  };
                                  next[index] = { ...next[index], windows };
                                  return next;
                                });
                              }}
                            />
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-8"
                              aria-label={t("removeWindow", {
                                day: t(`days.${dayKey}`),
                              })}
                              onClick={() => {
                                setRows((current) => {
                                  const next = [...(current ?? editor)];
                                  const windows = next[index].windows.filter(
                                    (_, item) => item !== windowIndex,
                                  );
                                  next[index] = {
                                    enabled: windows.length > 0,
                                    windows:
                                      windows.length > 0
                                        ? windows
                                        : [{ startMinute: 9 * 60, endMinute: 17 * 60 }],
                                  };
                                  return next;
                                });
                              }}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                            {windowIndex === row.windows.length - 1 ? (
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-8"
                                aria-label={t("addWindow")}
                                onClick={() => {
                                  setRows((current) => {
                                    const next = [...(current ?? editor)];
                                    next[index] = {
                                      ...next[index],
                                      windows: [
                                        ...next[index].windows,
                                        { startMinute: 13 * 60, endMinute: 17 * 60 },
                                      ],
                                    };
                                    return next;
                                  });
                                }}
                              >
                                <Plus className="size-4" />
                              </Button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="self-center text-sm text-muted-foreground">
                        {t("dayUnavailable")}
                      </p>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="text-base">{t("dateSpecific")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{t("dateSpecificBody")}</p>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start">
                    {overrideDate ? format(overrideDate, "PPP") : t("pickDate")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={overrideDate}
                    onSelect={(date) => setOverrideDate(date)}
                  />
                </PopoverContent>
              </Popover>
              <div className="grid gap-2">
                <Label>{t("customHoursLabel")}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="time"
                    aria-label={t("overrideStart")}
                    value={overrideStart}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setOverrideStart(event.target.value)
                    }
                  />
                  <span className="text-muted-foreground">–</span>
                  <Input
                    type="time"
                    aria-label={t("overrideEnd")}
                    value={overrideEnd}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setOverrideEnd(event.target.value)
                    }
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={!overrideDate || addOverride.isPending}
                  onClick={() => addOverride.mutate(true)}
                >
                  {t("markUnavailable")}
                </Button>
                <Button
                  className="flex-1"
                  disabled={!overrideDate || addOverride.isPending}
                  onClick={() => addOverride.mutate(false)}
                >
                  {t("customHours")}
                </Button>
              </div>
              <ul className="space-y-2 text-sm">
                {(schedule.overrides ?? []).map((override) => (
                  <li
                    key={override.date}
                    className="flex items-center justify-between gap-2 rounded-md bg-muted/60 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{override.date}</p>
                      <p className="text-muted-foreground">
                        {override.isUnavailable
                          ? t("dayUnavailable")
                          : `${formatMinute(override.startMinute ?? 0)} – ${formatMinute(override.endMinute ?? 0)}`}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-8 shrink-0"
                      aria-label={t("removeOverride")}
                      disabled={removeOverride.isPending}
                      onClick={() => removeOverride.mutate(override.date)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {query.data?.source === "preview" ? (
        <p className="text-xs text-muted-foreground">
          Scheduling API is not online yet, so availability is saved in this browser for
          preview. Public slots regenerate from these hours after refresh.
        </p>
      ) : null}
    </div>
  );
}
