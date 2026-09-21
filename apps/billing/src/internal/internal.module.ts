import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InternalController } from './internal.controller';

@Module({
  imports: [AuthModule],
  controllers: [InternalController],
})
export class InternalModule {}
