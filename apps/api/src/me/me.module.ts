import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module';
import { MembershipsModule } from '../memberships/memberships.module';
import { RefreshTokensModule } from '../refresh-tokens/refresh-tokens.module';
import { UsersModule } from '../users/users.module';
import { MeBookingsController } from './me-bookings.controller';
import { MeBookingsService } from './me-bookings.service';
import { MeController } from './me.controller';
import { MeService } from './me.service';

@Module({
  imports: [UsersModule, MembershipsModule, RefreshTokensModule, BookingsModule],
  controllers: [MeController, MeBookingsController],
  providers: [MeService, MeBookingsService],
})
export class MeModule {}
