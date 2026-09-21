import { Module, forwardRef } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { MembershipsModule } from '../memberships/memberships.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { SchedulesModule } from '../schedules/schedules.module';
import { EventTypeRepository } from './event-type.repository';
import { EventTypesController } from './event-types.controller';
import { EventTypesService } from './event-types.service';
import { PrismaEventTypeRepository } from './prisma-event-type.repository';
import { PublicSchedulingController } from './public-scheduling.controller';

@Module({
  imports: [
    MembershipsModule,
    SchedulesModule,
    forwardRef(() => OrganizationsModule),
    forwardRef(() => AvailabilityModule),
  ],
  controllers: [EventTypesController, PublicSchedulingController],
  providers: [
    EventTypesService,
    { provide: EventTypeRepository, useClass: PrismaEventTypeRepository },
  ],
  exports: [EventTypesService, EventTypeRepository],
})
export class EventTypesModule {}
