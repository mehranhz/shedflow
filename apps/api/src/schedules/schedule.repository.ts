import { Repository } from '../common/persistence';
import {
  AvailabilityRuleEntity,
  CreateScheduleData,
  DateOverrideEntity,
  OverrideInput,
  RuleInput,
  ScheduleEntity,
  UpdateScheduleData,
} from './schedule';

export abstract class ScheduleRepository extends Repository<
  ScheduleEntity,
  CreateScheduleData,
  UpdateScheduleData
> {
  abstract findInOrganization(
    organizationId: string,
    id: string,
  ): Promise<ScheduleEntity | null>;

  abstract listByOrganization(
    organizationId: string,
  ): Promise<ScheduleEntity[]>;

  abstract listByHost(
    organizationId: string,
    hostUserId: string,
  ): Promise<ScheduleEntity[]>;

  abstract updateInOrganization(
    organizationId: string,
    id: string,
    data: UpdateScheduleData,
  ): Promise<ScheduleEntity>;

  abstract deleteInOrganization(
    organizationId: string,
    id: string,
  ): Promise<void>;

  abstract clearDefaultForHost(
    organizationId: string,
    hostUserId: string,
    exceptId?: string,
  ): Promise<void>;

  abstract listRules(scheduleId: string): Promise<AvailabilityRuleEntity[]>;

  abstract replaceRules(
    scheduleId: string,
    rules: RuleInput[],
  ): Promise<AvailabilityRuleEntity[]>;

  abstract listOverrides(scheduleId: string): Promise<DateOverrideEntity[]>;

  abstract upsertOverride(
    scheduleId: string,
    input: OverrideInput,
  ): Promise<DateOverrideEntity>;

  abstract deleteOverride(scheduleId: string, date: string): Promise<void>;
}
