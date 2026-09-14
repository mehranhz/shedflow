"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Calendar,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
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

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type DayRow = {
  enabled: boolean;
  windows: Array<{ startMinute: number; endMinute: number }>;
};

function rulesToRows(rules: AvailabilityRule[]): DayRow[] {
  return DAYS.map((_, dayOfWeek) => {
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
      await schedulingApi.replaceRules(organization, profile.id, schedule.id, rowsToRules(rows));
      if (timezone !== organization.timezone && role === "OWNER") {
        await orgsApi.update(organization.id, { timezone });
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["schedules", organization.id] });
      toast.success("Availability saved");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not save availability");
    },
  });

  const addOverride = useMutation({
    mutationFn: async (unavailable: boolean) => {
      if (!schedule || !overrideDate) {
        return;
      }
      const date = format(overrideDate, "yyyy-MM-dd");
      await schedulingApi.upsertOverride(organization, profile.id, schedule.id, date, {
        isUnavailable: unavailable,
        startMinute: unavailable ? null : 10 * 60,
        endMinute: unavailable ? null : 14 * 60,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["schedules", organization.id] });
      toast.success("Date override saved");
      setOverrideDate(undefined);
    },
  });

  const editor = rows ?? rulesToRows(schedule?.rules ?? []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Availability"
        description="Set your weekly hours. Invitees book within these windows."
        actions={
          <Button onClick={() => save.mutate()} disabled={save.isPending || !schedule}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        }
      />

      {query.isLoading ? <TableSkeleton /> : null}
      {query.error ? (
        <QueryError
          message={query.error instanceof Error ? query.error.message : "Could not load schedules"}
          onRetry={() => void query.refetch()}
        />
      ) : null}

      {schedule ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{schedule.name}</CardTitle>
              <TimezoneCombobox value={timezone} onChange={setTimezone} className="w-[260px]" />
            </CardHeader>
            <CardContent className="divide-y">
              {DAYS.map((day, index) => {
                const row = editor[index];
                return (
                  <div key={day} className="grid gap-3 py-4 sm:grid-cols-[140px_1fr]">
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
                      <span className="text-sm font-medium">{day}</span>
                    </div>
                    {row.enabled ? (
                      <div className="space-y-2">
                        {row.windows.map((window, windowIndex) => (
                          <div key={windowIndex} className="flex items-center gap-2">
                            <Input
                              className="w-28"
                              type="time"
                              value={minuteToInput(window.startMinute)}
                              onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
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
                              value={minuteToInput(window.endMinute)}
                              onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
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
                      <p className="self-center text-sm text-muted-foreground">Unavailable</p>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="text-base">Date-specific hours</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Override a single date — holidays or extra hours.
              </p>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start">
                    {overrideDate ? format(overrideDate, "PPP") : "Pick a date"}
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
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={!overrideDate || addOverride.isPending}
                  onClick={() => addOverride.mutate(true)}
                >
                  Unavailable
                </Button>
                <Button
                  className="flex-1"
                  disabled={!overrideDate || addOverride.isPending}
                  onClick={() => addOverride.mutate(false)}
                >
                  Custom hours
                </Button>
              </div>
              <ul className="space-y-2 text-sm">
                {(schedule.overrides ?? []).map((override) => (
                  <li
                    key={override.date}
                    className="flex items-center justify-between rounded-md bg-muted/60 px-3 py-2"
                  >
                    <span>{override.date}</span>
                    <span className="text-muted-foreground">
                      {override.isUnavailable
                        ? "Unavailable"
                        : `${formatMinute(override.startMinute ?? 0)} – ${formatMinute(override.endMinute ?? 0)}`}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
