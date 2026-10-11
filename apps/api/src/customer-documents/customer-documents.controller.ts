import {
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../users/user';
import { CustomerDocumentsService } from './customer-documents.service';

@Controller('customer/documents')
export class CustomerDocumentsController {
  constructor(private readonly documents: CustomerDocumentsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') q?: string,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.documents.list(user.id, { q, organizationId });
  }

  @Get('form-submissions/:id/download')
  async downloadSubmission(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Headers('user-agent') userAgent: string | undefined,
    @Res() res: Response,
  ) {
    const file = await this.documents.downloadFormSubmission(user.id, id, {
      ip: req.ip,
      userAgent,
    });
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}"`,
    );
    res.send(file.body);
  }

  @Get('shared/:id/download')
  async downloadShared(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Headers('user-agent') userAgent: string | undefined,
    @Res() res: Response,
  ) {
    const file = await this.documents.downloadShared(user.id, id, {
      ip: req.ip,
      userAgent,
    });
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}"`,
    );
    res.send(file.body);
  }
}
