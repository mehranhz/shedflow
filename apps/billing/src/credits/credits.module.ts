import { Module } from '@nestjs/common';
import { CreditsInternalController } from './credits-internal.controller';
import { CreditsService } from './credits.service';

@Module({
  controllers: [CreditsInternalController],
  providers: [CreditsService],
  exports: [CreditsService],
})
export class CreditsModule {}
