import { Module } from '@nestjs/common';
import { MembershipsModule } from '../memberships/memberships.module';
import { RefreshTokensModule } from '../refresh-tokens/refresh-tokens.module';
import { UsersModule } from '../users/users.module';
import { MeController } from './me.controller';
import { MeService } from './me.service';

@Module({
  imports: [UsersModule, MembershipsModule, RefreshTokensModule],
  controllers: [MeController],
  providers: [MeService],
})
export class MeModule {}
