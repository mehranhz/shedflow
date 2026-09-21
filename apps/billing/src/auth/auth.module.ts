import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { BillingSessionController } from './billing-session.controller';
import { InternalHmacGuard } from './guards/internal-hmac.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [PassportModule],
  controllers: [BillingSessionController],
  providers: [
    JwtStrategy,
    InternalHmacGuard,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
  exports: [InternalHmacGuard],
})
export class AuthModule {}
