import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { IsString, MinLength } from 'class-validator';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentOrgContext } from '../common/tenancy/current-org.decorator';
import { OrgGuard } from '../common/tenancy/org.guard';
import type { RequestContextValue } from '../common/tenancy/request-context';
import { RequireScopes } from '../developer/scopes.decorator';
import { ScopesGuard } from '../developer/scopes.guard';
import type { AuthenticatedUser } from '../users/user';
import { readMultipart } from './multipart';
import { PaymentReceiptService } from './payment-receipt.service';

class RejectReceiptDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}

@Controller('organizations/:orgId/bookings')
@UseGuards(OrgGuard, ScopesGuard)
export class BookingPaymentReceiptController {
  constructor(private readonly receipts: PaymentReceiptService) {}

  @Get(':id/payment-receipt')
  @RequireScopes('bookings:read')
  get(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOrgContext() _ctx: RequestContextValue,
  ) {
    return this.receipts.getForStaff(orgId, id);
  }

  @Post(':id/payment-receipt/approve')
  @RequireScopes('bookings:write')
  approve(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.receipts.approve(orgId, id, user.id);
  }

  @Post(':id/payment-receipt/reject')
  @RequireScopes('bookings:write')
  reject(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RejectReceiptDto,
  ) {
    return this.receipts.reject(orgId, id, user.id, dto.reason);
  }
}

@Public()
@Controller('public/bookings')
export class PublicPaymentReceiptController {
  constructor(private readonly receipts: PaymentReceiptService) {}

  @Post(':uid/payment-receipt')
  async upload(@Param('uid') uid: string, @Req() req: Request) {
    const form = await readMultipart(req);
    const file = form.files.find((item) => item.fieldName === 'file');
    const token = form.fields.token ?? '';
    if (!file || !token) {
      throw new BadRequestException('Receipt file and token are required');
    }
    return this.receipts.uploadPublic(uid, token, file);
  }
}

@Public()
@Controller('public/payment-receipts')
export class PaymentReceiptDownloadController {
  constructor(private readonly receipts: PaymentReceiptService) {}

  @Get(':id/download')
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('token') token = '',
  ) {
    const file = await this.receipts.openDownload(id, token);
    return new StreamableFile(createReadStream(file.path), {
      type: file.mimeType,
      disposition: `inline; filename="${encodeURIComponent(file.filename)}"`,
    });
  }
}
