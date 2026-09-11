import { Module } from '@nestjs/common';
import { PrismaRefreshTokenRepository } from './prisma-refresh-token.repository';
import { RefreshTokenRepository } from './refresh-token.repository';

@Module({
  providers: [
    {
      provide: RefreshTokenRepository,
      useClass: PrismaRefreshTokenRepository,
    },
  ],
  exports: [RefreshTokenRepository],
})
export class RefreshTokensModule {}
