import { All, Controller, NotFoundException } from '@nestjs/common';

@Controller()
export class FallbackController {
  @All('{*path}')
  unmatched(): never {
    throw new NotFoundException();
  }
}
