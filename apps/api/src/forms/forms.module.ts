import { Module, forwardRef } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module';
import { MembershipsModule } from '../memberships/memberships.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import {
  CustomerFormsController,
  PublicFormsController,
} from './customer-forms.controller';
import {
  FormAssignmentRepository,
  FormSubmissionRepository,
  FormTemplateRepository,
} from './form.repository';
import { FormsController } from './forms.controller';
import { FormsService } from './forms.service';
import {
  PrismaFormAssignmentRepository,
  PrismaFormSubmissionRepository,
  PrismaFormTemplateRepository,
} from './prisma-form.repository';

@Module({
  imports: [
    MembershipsModule,
    forwardRef(() => OrganizationsModule),
    forwardRef(() => BookingsModule),
  ],
  controllers: [
    FormsController,
    CustomerFormsController,
    PublicFormsController,
  ],
  providers: [
    FormsService,
    { provide: FormTemplateRepository, useClass: PrismaFormTemplateRepository },
    {
      provide: FormAssignmentRepository,
      useClass: PrismaFormAssignmentRepository,
    },
    {
      provide: FormSubmissionRepository,
      useClass: PrismaFormSubmissionRepository,
    },
  ],
  exports: [FormsService],
})
export class FormsModule {}
