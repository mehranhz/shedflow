import { Module, forwardRef } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { EventTypesModule } from '../event-types/event-types.module';
import { MembershipsModule } from '../memberships/memberships.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { BillingCheckoutClient } from './billing-checkout.client';
import { BillingCreditsClient } from './billing-credits.client';
import { BookingRepository } from './booking.repository';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { InternalBookingsController } from './internal-bookings.controller';
import { PrismaBookingRepository } from './prisma-booking.repository';
import { PublicBookingsController } from './public-bookings.controller';
import { SignedActionTokenRepository } from './signed-action-token.repository';

@Module({
  imports: [
    MembershipsModule,
    CustomersModule,
    forwardRef(() => EventTypesModule),
    forwardRef(() => OrganizationsModule),
  ],
  controllers: [
    BookingsController,
    PublicBookingsController,
    InternalBookingsController,
  ],
  providers: [
    BookingsService,
    BillingCheckoutClient,
    BillingCreditsClient,
    SignedActionTokenRepository,
    { provide: BookingRepository, useClass: PrismaBookingRepository },
  ],
  exports: [BookingsService, BookingRepository],
})
export class BookingsModule {}
