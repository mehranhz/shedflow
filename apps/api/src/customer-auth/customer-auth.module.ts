import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BookingsModule } from '../bookings/bookings.module';
import { CustomerSecurityModule } from '../customer-security/customer-security.module';
import { MembershipsModule } from '../memberships/memberships.module';
import { UsersModule } from '../users/users.module';
import { CustomerAuthController } from './customer-auth.controller';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerBookingsService } from './customer-bookings.service';
import { CustomerProfileService } from './customer-profile.service';
import { CustomerSessionController } from './customer-session.controller';

@Module({
  imports: [AuthModule, UsersModule, MembershipsModule, BookingsModule, CustomerSecurityModule],
  controllers: [CustomerAuthController, CustomerSessionController],
  providers: [CustomerAuthService, CustomerBookingsService, CustomerProfileService],
})
export class CustomerAuthModule {}
