import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { ConnectController } from './connect.controller';
import { ConnectService } from './connect.service';
import { PlatformAccountRepository } from './platform-account.repository';
import { PrismaPlatformAccountRepository } from './prisma-platform-account.repository';

@Module({
  imports: [PaymentsModule],
  controllers: [ConnectController],
  providers: [
    ConnectService,
    {
      provide: PlatformAccountRepository,
      useClass: PrismaPlatformAccountRepository,
    },
  ],
  exports: [ConnectService, PlatformAccountRepository],
})
export class ConnectModule {}
