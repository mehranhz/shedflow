import { Injectable } from '@nestjs/common';

/**
 * Wave 12 (T-057) owns real prefs. Until then, allow-all so engagement
 * notifications are not blocked.
 */
export abstract class NotificationPrefsPort {
  abstract allows(
    userId: string,
    kind: string,
    channel?: 'email' | 'in_app',
  ): Promise<boolean>;
}

@Injectable()
export class AllowAllNotificationPrefs extends NotificationPrefsPort {
  async allows(
    _userId: string,
    _kind: string,
    _channel?: 'email' | 'in_app',
  ): Promise<boolean> {
    return true;
  }
}
