import { Controller, Get } from '@nestjs/common';
import { SHEDFLOW_VERSION } from '@shedflow/shared';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<{
    status: 'ok';
    db: boolean;
    version: string;
  }> {
    let db = false;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = true;
    } catch {
      db = false;
    }

    return { status: 'ok', db, version: SHEDFLOW_VERSION };
  }
}
