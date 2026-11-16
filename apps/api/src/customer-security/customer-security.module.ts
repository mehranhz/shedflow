import { Module } from '@nestjs/common';
import { CustomerJwtGuard } from '../customer-payments/customer-jwt.guard';
import { RefreshTokensModule } from '../refresh-tokens/refresh-tokens.module';
import { UsersModule } from '../users/users.module';
import { BackupCodeRepository } from './backup-code.repository';
import { CustomerSecurityController } from './customer-security.controller';
import { CustomerSecurityService } from './customer-security.service';
import { PrismaBackupCodeRepository } from './prisma-backup-code.repository';
import { PrismaTotpCredentialRepository } from './prisma-totp-credential.repository';
import { TotpCredentialRepository } from './totp-credential.repository';

@Module({
  imports: [UsersModule, RefreshTokensModule],
  controllers: [CustomerSecurityController],
  providers: [
    CustomerSecurityService,
    CustomerJwtGuard,
    { provide: TotpCredentialRepository, useClass: PrismaTotpCredentialRepository },
    { provide: BackupCodeRepository, useClass: PrismaBackupCodeRepository },
  ],
  exports: [CustomerSecurityService],
})
export class CustomerSecurityModule {}
