import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import type { RefreshTokenClientMeta } from '../refresh-tokens/refresh-token';
import { CustomerAuthService } from './customer-auth.service';
import {
  CustomerClaimConfirmDto,
  CustomerClaimDto,
  CustomerLoginDto,
  CustomerRegisterDto,
} from './dto/customer-auth.dto';

@Public()
@Controller('customer/auth')
export class CustomerAuthController {
  constructor(private readonly customers: CustomerAuthService) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60 * 60 * 1000 } })
  async register(@Body() dto: CustomerRegisterDto, @Req() req: Request) {
    const session = await this.customers.register(dto, meta(req));
    return { success: true, data: session };
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 15 * 60 * 1000 } })
  async login(@Body() dto: CustomerLoginDto, @Req() req: Request) {
    const session = await this.customers.login(dto.email, dto.password, meta(req));
    return { success: true, data: session };
  }

  @Post('claim')
  @HttpCode(204)
  @Throttle({ default: { limit: 5, ttl: 60 * 60 * 1000 } })
  claim(@Body() dto: CustomerClaimDto) {
    return this.customers.requestClaim(dto.email);
  }

  @Post('claim/confirm')
  @HttpCode(200)
  async confirm(@Body() dto: CustomerClaimConfirmDto, @Req() req: Request) {
    const session = await this.customers.confirmClaim(dto.token, meta(req));
    return { success: true, data: session };
  }
}

function meta(req: Request): RefreshTokenClientMeta {
  const userAgent = req.headers['user-agent'];
  return {
    userAgent: typeof userAgent === 'string' ? userAgent : null,
    ip: req.ip ?? null,
  };
}
