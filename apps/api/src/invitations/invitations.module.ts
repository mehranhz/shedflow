import { Module } from '@nestjs/common';
import { InvitationRepository } from './invitation.repository';
import { PrismaInvitationRepository } from './prisma-invitation.repository';

@Module({
  providers: [
    { provide: InvitationRepository, useClass: PrismaInvitationRepository },
  ],
  exports: [InvitationRepository],
})
export class InvitationsModule {}
