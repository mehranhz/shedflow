import { All, Controller, NotFoundException } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';

@Public()
@Controller()
export class FallbackController {
  @All('{*path}')
  unhandled(): never {
    throw new NotFoundException();
  }
}
