import {
  Controller,
  Delete,
  Get,
  HttpCode,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../users/user';
import { MeService } from './me.service';

@Controller('me')
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get('export')
  export(@CurrentUser() user: AuthenticatedUser) {
    return this.me.export(user.id);
  }

  @Delete()
  @HttpCode(204)
  erase(@CurrentUser() user: AuthenticatedUser) {
    return this.me.erase(user.id);
  }
}
