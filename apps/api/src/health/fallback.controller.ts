import { All, Controller, NotFoundException } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';

/** Unused duplicate; prefer `fallback/fallback.controller.ts`. */
@Public()
@Controller()
export class FallbackController {
  @All('{*path}')
  unmatched(): never {
    throw new NotFoundException();
  }
}
