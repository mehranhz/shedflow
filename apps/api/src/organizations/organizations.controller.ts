import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
  forwardRef,
} from '@nestjs/common';
import { Role } from '@shedflow/db';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Idempotent } from '../common/idempotency/idempotent.decorator';
import { CurrentOrgContext } from '../common/tenancy/current-org.decorator';
import { OrgGuard } from '../common/tenancy/org.guard';
import { Roles } from '../common/tenancy/roles.decorator';
import { RolesGuard } from '../common/tenancy/roles.guard';
import type { RequestContextValue } from '../common/tenancy/request-context';
import type { AuthenticatedUser, PublicUser } from '../users/user';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { OrganizationsService } from './organizations.service';

@Controller('organizations')
export class OrganizationsController {
  constructor(
    private readonly organizations: OrganizationsService,
    @Inject(forwardRef(() => AuthService))
    private readonly auth: AuthService,
  ) {}

  @Get()
  list(@CurrentUser() user: PublicUser) {
    return this.organizations.listForUser(user.id);
  }

  @Post()
  @Idempotent()
  create(
    @CurrentUser() user: PublicUser,
    @Body() dto: CreateOrganizationDto,
    @Req() req: Request,
  ) {
    const userAgent = req.headers['user-agent'];
    return this.organizations.create(user.id, dto, {
      ip: req.ip ?? null,
      userAgent: typeof userAgent === 'string' ? userAgent : null,
    });
  }

  @Get(':orgId')
  @UseGuards(OrgGuard)
  get(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.organizations.getForViewer(orgId, user);
  }

  @Patch(':orgId')
  @UseGuards(OrgGuard, RolesGuard)
  @Roles(Role.OWNER)
  update(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @CurrentOrgContext() ctx: RequestContextValue,
    @Body() dto: UpdateOrganizationDto,
  ) {
    return this.organizations.update(orgId, ctx, dto);
  }

  @Delete(':orgId')
  @HttpCode(204)
  @UseGuards(OrgGuard, RolesGuard)
  @Roles(Role.OWNER)
  remove(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @CurrentOrgContext() ctx: RequestContextValue,
  ) {
    return this.organizations.softDelete(orgId, ctx);
  }

  @Post(':orgId/switch')
  @UseGuards(OrgGuard)
  switchOrg(
    @CurrentUser() user: PublicUser,
    @CurrentOrgContext() ctx: RequestContextValue,
  ) {
    return this.auth.issueAccessForOrganization(
      user,
      ctx.organizationId,
      ctx.role,
    );
  }

  @Get(':orgId/members')
  @UseGuards(OrgGuard)
  listMembers(@Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.organizations.listMembers(orgId);
  }

  @Patch(':orgId/members/:userId')
  @UseGuards(OrgGuard, RolesGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  updateMember(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentOrgContext() ctx: RequestContextValue,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.organizations.updateMember(orgId, userId, ctx, dto);
  }

  @Delete(':orgId/members/:userId')
  @HttpCode(204)
  @UseGuards(OrgGuard, RolesGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  removeMember(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentOrgContext() ctx: RequestContextValue,
  ) {
    return this.organizations.removeMember(orgId, userId, ctx);
  }

  @Post(':orgId/invitations')
  @UseGuards(OrgGuard, RolesGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  invite(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @CurrentOrgContext() ctx: RequestContextValue,
    @Body() dto: CreateInvitationDto,
  ) {
    return this.organizations.invite(orgId, ctx, dto);
  }

  @Delete(':orgId/invitations/:invitationId')
  @HttpCode(204)
  @UseGuards(OrgGuard, RolesGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  revokeInvitation(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
    @CurrentOrgContext() ctx: RequestContextValue,
  ) {
    return this.organizations.revokeInvitation(orgId, invitationId, ctx);
  }
}
