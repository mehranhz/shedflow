import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { MembershipStatus, Role } from '@shedflow/db';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { MembershipRepository } from '../../memberships/membership.repository';
import { UsersService } from '../../users/users.service';
import { AuthenticatedUser } from '../../users/user';
import { parsePlatformAdmins } from '../../platform/platform-admins';
import { ACCESS_TOKEN_TYPE } from '../auth.constants';
import { JwtPayload } from '../types/jwt-payload';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly memberships: MembershipRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (payload.typ !== ACCESS_TOKEN_TYPE) {
      throw new UnauthorizedException();
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException();
    }

    const publicUser = this.usersService.toPublic(user);

    if (payload.impersonatingOrgId) {
      const admins = parsePlatformAdmins(
        this.configService.get<string>('PLATFORM_ADMINS'),
      );
      const email = publicUser.email.trim().toLowerCase();
      if (
        admins.size === 0 ||
        !admins.has(email) ||
        payload.orgId !== payload.impersonatingOrgId
      ) {
        throw new UnauthorizedException();
      }
      return {
        ...publicUser,
        orgId: payload.impersonatingOrgId,
        role: payload.role ?? Role.ADMIN,
        actorType: 'user',
        impersonatingOrgId: payload.impersonatingOrgId,
      };
    }

    if (!payload.orgId) {
      return publicUser;
    }

    const membership = await this.memberships.findByUserInOrganization(
      payload.orgId,
      user.id,
    );
    if (!membership || membership.status !== MembershipStatus.ACTIVE) {
      return publicUser;
    }

    return {
      ...publicUser,
      orgId: payload.orgId,
      role: membership.role,
      actorType: 'user',
    };
  }
}
