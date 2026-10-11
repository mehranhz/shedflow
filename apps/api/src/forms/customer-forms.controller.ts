import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { Idempotent } from '../common/idempotency/idempotent.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../users/user';
import { BookingsService } from '../bookings/bookings.service';
import { RequestUploadUrlDto, SubmitFormDto } from './dto/forms.dto';
import { FormsService } from './forms.service';

@Controller('customer/forms')
export class CustomerFormsController {
  constructor(
    private readonly forms: FormsService,
    private readonly bookings: BookingsService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.forms.listAssignmentsForUser(user.id);
  }

  @Get(':assignmentId')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
  ) {
    return this.forms.getAssignmentForUser(assignmentId, user.id);
  }

  @Post(':assignmentId/upload-url')
  requestUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body() dto: RequestUploadUrlDto,
  ) {
    return this.forms.getAssignmentForUser(assignmentId, user.id).then(() =>
      this.forms.createUploadUrl({
        assignmentId,
        fieldKey: dto.fieldKey,
        mimeType: dto.mimeType,
        sizeBytes: dto.sizeBytes,
      }),
    );
  }

  @Post(':assignmentId/submit')
  @Idempotent()
  async submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body() dto: SubmitFormDto,
    @Req() req: Request,
    @Headers('user-agent') userAgent?: string,
  ) {
    const result = await this.forms.submitAssignment({
      assignmentId,
      answers: dto.answers,
      signatureName: dto.signatureName,
      waiverAccepted: dto.waiverAccepted,
      signerIp: req.ip,
      userAgent,
      userId: user.id,
    });
    if (result.autoConfirmed) {
      const assignment = await this.forms.getAssignmentForUser(
        assignmentId,
        user.id,
      );
      await this.bookings.confirmInternal(assignment.bookingId);
    }
    return result.submission;
  }
}

/** Guest/manage-link path: submit with bookingUid proof (Wave 9 claim optional). */
@Controller('public/forms')
export class PublicFormsController {
  constructor(
    private readonly forms: FormsService,
    private readonly bookings: BookingsService,
  ) {}

  @Public()
  @Get(':assignmentId')
  get(
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Headers('x-booking-uid') bookingUid: string,
  ) {
    return this.forms.getAssignmentPublic(assignmentId, bookingUid);
  }

  @Public()
  @Post(':assignmentId/submit')
  @Idempotent()
  async submit(
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body() dto: SubmitFormDto,
    @Req() req: Request,
    @Headers('user-agent') userAgent?: string,
  ) {
    if (!dto.bookingUid?.trim()) {
      throw new BadRequestException({
        code: 'BOOKING_UID_REQUIRED',
        message: 'bookingUid is required for public form submit',
      });
    }
    const result = await this.forms.submitAssignment({
      assignmentId,
      answers: dto.answers,
      signatureName: dto.signatureName,
      waiverAccepted: dto.waiverAccepted,
      signerIp: req.ip,
      userAgent,
      bookingUid: dto.bookingUid,
    });
    if (result.autoConfirmed) {
      const assignment = await this.forms.getAssignmentPublic(
        assignmentId,
        dto.bookingUid,
      );
      await this.bookings.confirmInternal(assignment.bookingId);
    }
    return result.submission;
  }
}
