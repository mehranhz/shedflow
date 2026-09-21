import { Injectable } from '@nestjs/common';
import { DomainEventStatus, Prisma } from '@shedflow/db';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BillingOutbox {
  constructor(private readonly prisma: PrismaService) {}

  async emit(
    type: string,
    payload: Record<string, unknown>,
    organizationId?: string | null,
  ): Promise<void> {
    await this.prisma.domainEvent.create({
      data: {
        type,
        payload: payload as Prisma.InputJsonValue,
        organizationId: organizationId ?? null,
        status: DomainEventStatus.PENDING,
      },
    });
  }
}
