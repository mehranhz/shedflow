import { Module } from '@nestjs/common';
import { PrismaUserTokenRepository } from './prisma-user-token.repository';
import { UserTokenRepository } from './user-token.repository';

@Module({
  providers: [
    { provide: UserTokenRepository, useClass: PrismaUserTokenRepository },
  ],
  exports: [UserTokenRepository],
})
export class UserTokensModule {}
