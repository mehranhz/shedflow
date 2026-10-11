import { Module } from '@nestjs/common';
import { DomainEventsModule } from '../domain-events/domain-events.module';
import { MembershipsModule } from '../memberships/memberships.module';
import { RefreshTokensModule } from '../refresh-tokens/refresh-tokens.module';
import { UsersModule } from '../users/users.module';
import { CustomerAnalytics } from './customer-analytics';
import { CustomerGdprService } from './customer-gdpr.service';
import { CustomerPortalController } from './customer-portal.controller';

@Module({
  imports: [
    UsersModule,
    MembershipsModule,
    RefreshTokensModule,
    DomainEventsModule,
  ],
  controllers: [CustomerPortalController],
  providers: [CustomerGdprService, CustomerAnalytics],
  exports: [CustomerGdprService, CustomerAnalytics],
})
export class CustomerPortalModule {}
