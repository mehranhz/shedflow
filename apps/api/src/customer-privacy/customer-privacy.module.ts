import { Module } from '@nestjs/common';
import { CustomerJwtGuard } from '../customer-payments/customer-jwt.guard';
import { ConsentLogRepository } from './consent-log.repository';
import { CustomerPrivacyController } from './customer-privacy.controller';
import { CustomerPrivacyService } from './customer-privacy.service';
import { PrismaConsentLogRepository } from './prisma-consent-log.repository';

@Module({
  controllers: [CustomerPrivacyController],
  providers: [
    CustomerPrivacyService,
    CustomerJwtGuard,
    { provide: ConsentLogRepository, useClass: PrismaConsentLogRepository },
  ],
  exports: [CustomerPrivacyService],
})
export class CustomerPrivacyModule {}
