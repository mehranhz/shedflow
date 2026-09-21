import { Module, forwardRef } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { MembershipsModule } from '../memberships/memberships.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ImpersonationAuditInterceptor } from './impersonation-audit.interceptor';
import { PlatformAdminGuard } from './platform-admin.guard';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';

@Module({
  imports: [
    AuditModule,
    MembershipsModule,
    forwardRef(() => OrganizationsModule),
    forwardRef(() => AuthModule),
  ],
  controllers: [PlatformController],
  providers: [
    PlatformService,
    PlatformAdminGuard,
    {
      provide: APP_INTERCEPTOR,
      useClass: ImpersonationAuditInterceptor,
    },
  ],
  exports: [PlatformService],
})
export class PlatformModule {}
