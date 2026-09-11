import { Module } from '@nestjs/common';
import { MembershipRepository } from './membership.repository';
import { PrismaMembershipRepository } from './prisma-membership.repository';

@Module({
  providers: [
    { provide: MembershipRepository, useClass: PrismaMembershipRepository },
  ],
  exports: [MembershipRepository],
})
export class MembershipsModule {}
