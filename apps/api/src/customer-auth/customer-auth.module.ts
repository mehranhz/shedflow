import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BookingsModule } from '../bookings/bookings.module';
import { MembershipsModule } from '../memberships/memberships.module';
import { UsersModule } from '../users/users.module';
import { CustomerAuthController } from './customer-auth.controller';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerBookingsService } from './customer-bookings.service';
import { CustomerSessionController } from './customer-session.controller';

@Module({
  imports: [AuthModule, UsersModule, MembershipsModule, BookingsModule],
  controllers: [CustomerAuthController, CustomerSessionController],
  providers: [CustomerAuthService, CustomerBookingsService],
})
export class CustomerAuthModule {}
