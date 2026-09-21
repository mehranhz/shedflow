export type AvailabilityRuleEntity = {
  id: string;
  scheduleId: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
};

export type DateOverrideEntity = {
  id: string;
  scheduleId: string;
  date: string;
  isUnavailable: boolean;
  startMinute: number | null;
  endMinute: number | null;
};

export type ScheduleEntity = {
  id: string;
  organizationId: string;
  hostUserId: string;
  name: string;
  timezone: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type ScheduleView = ScheduleEntity & {
  rules: AvailabilityRuleEntity[];
  overrides: DateOverrideEntity[];
};

export type CreateScheduleData = {
  organizationId: string;
  hostUserId: string;
  name: string;
  timezone: string;
  isDefault?: boolean;
};

export type UpdateScheduleData = Partial<{
  name: string;
  timezone: string;
  isDefault: boolean;
}>;

export type RuleInput = {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
};

export type OverrideInput = {
  date: string;
  isUnavailable: boolean;
  startMinute?: number | null;
  endMinute?: number | null;
};
