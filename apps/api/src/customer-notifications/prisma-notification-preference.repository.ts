import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type NotificationPreference as NotificationPreferenceRow,
} from '@shedflow/db';
import {
  PrismaModelDelegate,
  PrismaRepository,
} from '../prisma/prisma.repository';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateNotificationPreferenceData,
  NotificationPreference,
  UpdateNotificationPreferenceData,
} from './notification-preference';
import { NotificationPreferenceRepository } from './notification-preference.repository';

@Injectable()
export class PrismaNotificationPreferenceRepository
  extends PrismaRepository<
    NotificationPreferenceRow,
    NotificationPreference,
    CreateNotificationPreferenceData,
    UpdateNotificationPreferenceData
  >
  implements NotificationPreferenceRepository
{
  constructor(prisma: PrismaService) {
    super(prisma, 'NotificationPreference');
  }

  protected delegate(
    client: Prisma.TransactionClient,
  ): PrismaModelDelegate<NotificationPreferenceRow> {
    return client.notificationPreference;
  }

  protected toEntity(record: NotificationPreferenceRow): NotificationPreference {
    return {
      id: record.id,
      userId: record.userId,
      organizationId: record.organizationId,
      emailEnabled: record.emailEnabled,
      smsEnabled: record.smsEnabled,
      pushEnabled: record.pushEnabled,
      remindersEnabled: record.remindersEnabled,
      marketingEnabled: record.marketingEnabled,
      receiptsEnabled: record.receiptsEnabled,
      waitlistEnabled: record.waitlistEnabled,
      messagesEnabled: record.messagesEnabled,
      quietHoursStart: record.quietHoursStart,
      quietHoursEnd: record.quietHoursEnd,
      timezone: record.timezone,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  findForScope(
    userId: string,
    organizationId: string | null,
  ): Promise<NotificationPreference | null> {
    return this.findOneWhere({ userId, organizationId });
  }
}
