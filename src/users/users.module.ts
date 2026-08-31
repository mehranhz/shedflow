import { Module } from '@nestjs/common';
import { PrismaUserRepository } from './prisma-user.repository';
import { UserRepository } from './user.repository';
import { UsersService } from './users.service';

// Swapping the ORM or database for this module means pointing `UserRepository`
// at another implementation. Nothing in the service layer changes.
@Module({
  providers: [
    UsersService,
    { provide: UserRepository, useClass: PrismaUserRepository },
  ],
  exports: [UsersService],
})
export class UsersModule {}
