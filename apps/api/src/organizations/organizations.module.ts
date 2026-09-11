import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrgGuard } from '../common/tenancy/org.guard';
import { InvitationsController } from '../invitations/invitations.controller';
import { InvitationsModule } from '../invitations/invitations.module';
import { MembershipsModule } from '../memberships/memberships.module';
import { UsersModule } from '../users/users.module';
import { OrganizationRepository } from './organization.repository';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { PrismaOrganizationRepository } from './prisma-organization.repository';

@Module({
  imports: [
    MembershipsModule,
    InvitationsModule,
    UsersModule,
    forwardRef(() => AuthModule),
  ],
  controllers: [OrganizationsController, InvitationsController],
  providers: [
    OrganizationsService,
    OrgGuard,
    {
      provide: OrganizationRepository,
      useClass: PrismaOrganizationRepository,
    },
  ],
  exports: [OrganizationsService, OrganizationRepository, OrgGuard],
})
export class OrganizationsModule {}
