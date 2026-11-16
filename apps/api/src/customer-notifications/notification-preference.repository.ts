import { Repository } from '../common/persistence';
import {
  CreateNotificationPreferenceData,
  NotificationPreference,
  UpdateNotificationPreferenceData,
} from './notification-preference';

export abstract class NotificationPreferenceRepository extends Repository<
  NotificationPreference,
  CreateNotificationPreferenceData,
  UpdateNotificationPreferenceData
> {
  /** User scope. `organizationId` null is the global row. */
  abstract findForScope(
    userId: string,
    organizationId: string | null,
  ): Promise<NotificationPreference | null>;
}
