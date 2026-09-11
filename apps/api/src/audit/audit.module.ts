import { Global, Module } from '@nestjs/common';
import { AuditLogRepository } from './audit-log.repository';
import { AuditService } from './audit.service';
import { PrismaAuditLogRepository } from './prisma-audit-log.repository';

@Global()
@Module({
  providers: [
    AuditService,
    { provide: AuditLogRepository, useClass: PrismaAuditLogRepository },
  ],
  exports: [AuditService, AuditLogRepository],
})
export class AuditModule {}
