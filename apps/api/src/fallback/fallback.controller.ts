import { All, Controller, NotFoundException } from '@nestjs/common';

@Controller()
export class FallbackController {
  @All('{*path}')
  unhandled(): never {
    throw new NotFoundException();
  }
}
