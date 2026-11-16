import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { REFRESH_TOKEN_HEADER } from './auth.constants';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RequestOtpDto, VerifyOtpDto } from './dto/otp.dto';
import { OtpService } from './otp.service';
import { RefreshDto } from './dto/refresh.dto';
import { LogoutDto } from './dto/logout.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { CustomerSecurityService } from '../customer-security/customer-security.service';
import { MfaLoginDto } from '../customer-security/dto/customer-security.dto';
import { UsersService } from '../users/users.service';
import type { AuthenticatedUser, PublicUser } from '../users/user';
import type { RefreshTokenClientMeta } from '../refresh-tokens/refresh-token';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly otp: OtpService,
    private readonly security: CustomerSecurityService,
    private readonly users: UsersService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60 * 60 * 1000 } })
  @Post('register')
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    const session = await this.authService.register(dto, this.clientMeta(req));
    return { ...session, success: true, data: session };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 15 * 60 * 1000 } })
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const identifier = (dto.phone ?? dto.username ?? '').trim();
    const user = await this.authService.validateUser(identifier, dto.password);
    if (!user) {
      throw new UnauthorizedException('Invalid phone or password');
    }
    const mfaToken = await this.security.beginLogin(user.id);
    if (mfaToken) {
      return {
        success: true,
        data: { mfaRequired: true, mfaToken },
      };
    }
    const session = await this.authService.login(user, this.clientMeta(req));
    return { ...session, success: true, data: session };
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 15 * 60 * 1000 } })
  @HttpCode(200)
  @Post('login/totp')
  async loginTotp(@Body() dto: MfaLoginDto, @Req() req: Request) {
    const userId = await this.security.consumeLogin(dto.mfaToken, dto.code);
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    const session = await this.authService.login(
      this.users.toPublic(user),
      this.clientMeta(req),
    );
    return { ...session, success: true, data: session };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 15 * 60 * 1000 } })
  @HttpCode(200)
  @Post('request-otp')
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.otp.request(dto.username);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 15 * 60 * 1000 } })
  @HttpCode(200)
  @Post('verify-otp')
  async verifyOtp(@Body() dto: VerifyOtpDto, @Req() req: Request) {
    const session = await this.otp.verify(dto.username, dto.code, this.clientMeta(req));
    return {
      success: true,
      data: {
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        user: {
          id: session.user.id,
          phone: session.user.phone ?? null,
          createdAt: session.user.createdAt,
        },
      },
    };
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 15 * 60 * 1000 } })
  @HttpCode(200)
  @Post('refresh')
  refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    return this.authService.refresh(
      dto.refreshToken,
      this.clientMeta(req),
      dto.organizationId,
    );
  }

  @HttpCode(204)
  @Post('logout')
  logout(
    @CurrentUser() user: PublicUser,
    @Body() dto: LogoutDto,
    @Headers(REFRESH_TOKEN_HEADER) headerToken?: string,
  ) {
    return this.authService.logout(
      user.id,
      dto?.refreshToken ?? headerToken,
    );
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60 * 60 * 1000 } })
  @HttpCode(204)
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.phone);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 15 * 60 * 1000 } })
  @HttpCode(204)
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.password);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 15 * 60 * 1000 } })
  @HttpCode(204)
  @Post('verify-email')
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.token);
  }

  @HttpCode(204)
  @Post('resend-verification')
  resendVerification(@CurrentUser() user: PublicUser) {
    return this.authService.resendVerification(user.id);
  }

  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    const profile = await this.authService.getProfile(
      user.id,
      user.orgId,
      user.impersonatingOrgId,
    );
    const data = await this.authService.getClientProfile(
      user.id,
      user.orgId,
      user.impersonatingOrgId,
    );
    return { ...profile, success: true, status: 200, data };
  }

  private clientMeta(req: Request): RefreshTokenClientMeta {
    const userAgent = req.headers['user-agent'];
    return {
      userAgent: typeof userAgent === 'string' ? userAgent : null,
      ip: req.ip ?? null,
    };
  }
}
