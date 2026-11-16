import { Module } from '@nestjs/common';
import { CustomerJwtGuard } from '../customer-payments/customer-jwt.guard';
import { CustomerNotificationsController } from './customer-notifications.controller';
import { CustomerNotificationsService } from './customer-notifications.service';
import { NotificationPreferenceRepository } from './notification-preference.repository';
import { PrismaNotificationPreferenceRepository } from './prisma-notification-preference.repository';

@Module({
  controllers: [CustomerNotificationsController],
  providers: [
    CustomerNotificationsService,
    CustomerJwtGuard,
    {
      provide: NotificationPreferenceRepository,
      useClass: PrismaNotificationPreferenceRepository,
    },
  ],
  exports: [CustomerNotificationsService],
})
export class CustomerNotificationsModule {}
