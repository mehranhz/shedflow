import type { PrismaService } from '../prisma/prisma.service';
import {
  mergeNotificationPrefs,
  notificationAllowed,
  type NotificationCategory,
  type NotificationChannelName,
  type StoredNotificationPrefs,
} from '@shedflow/shared';

type PrefClient = Pick<PrismaService, 'notificationPreference'>;

/**
 * Loads the user row, then the optional per-organization override.
 * A missing user (guest invitee) uses the defaults: reminders on, marketing off.
 */
export async function allowsUserNotification(
  prisma: PrefClient,
  userId: string | null,
  organizationId: string | null,
  category: NotificationCategory,
  channel: NotificationChannelName = 'email',
  at: Date = new Date(),
): Promise<boolean> {
  const prefs = await loadPrefs(prisma, userId, organizationId);
  return notificationAllowed(prefs, { category, channel, at });
}

async function loadPrefs(
  prisma: PrefClient,
  userId: string | null,
  organizationId: string | null,
): Promise<StoredNotificationPrefs> {
  if (!userId) {
    return mergeNotificationPrefs(null, null);
  }
  const rows = await prisma.notificationPreference.findMany({
    where: {
      userId,
      OR: [
        { organizationId: null },
        ...(organizationId ? [{ organizationId }] : []),
      ],
    },
  });
  const global = rows.find((row) => row.organizationId == null) ?? null;
  const org = organizationId
    ? (rows.find((row) => row.organizationId === organizationId) ?? null)
    : null;
  return mergeNotificationPrefs(global, org);
}
