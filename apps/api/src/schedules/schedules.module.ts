import { Module, forwardRef } from '@nestjs/common';
import { MembershipsModule } from '../memberships/memberships.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { PrismaScheduleRepository } from './prisma-schedule.repository';
import { ScheduleRepository } from './schedule.repository';
import { SchedulesController } from './schedules.controller';
import { SchedulesService } from './schedules.service';

@Module({
  imports: [MembershipsModule, forwardRef(() => OrganizationsModule)],
  controllers: [SchedulesController],
  providers: [
    SchedulesService,
    { provide: ScheduleRepository, useClass: PrismaScheduleRepository },
  ],
  exports: [SchedulesService, ScheduleRepository],
})
export class SchedulesModule {}
