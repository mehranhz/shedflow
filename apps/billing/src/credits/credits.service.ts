import {
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CreditReason } from '@shedflow/db';
import { PrismaService } from '../prisma/prisma.service';

export type ConsumeCreditsInput = {
  organizationId: string;
  customerId: string;
  bookingId: string;
  cost: number;
  subscriptionId?: string | null;
};

export type ReleaseCreditsInput = {
  organizationId: string;
  customerId: string;
  bookingId: string;
};

export type PeriodResetInput = {
  organizationId: string;
  customerId: string;
  subscriptionId?: string | null;
  grant: number;
  periodStart: Date;
  periodEnd: Date;
};

@Injectable()
export class CreditsService {
  constructor(private readonly prisma: PrismaService) {}

  async consume(input: ConsumeCreditsInput): Promise<{ balance: number }> {
    if (input.cost <= 0) {
      throw new UnprocessableEntityException({
        code: 'VALIDATION_ERROR',
        message: 'cost must be positive',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const existingConsume = await tx.creditLedgerEntry.findFirst({
        where: {
          organizationId: input.organizationId,
          customerId: input.customerId,
          bookingId: input.bookingId,
          reason: CreditReason.CONSUME,
        },
      });
      if (existingConsume) {
        return { balance: existingConsume.balanceAfter };
      }

      await tx.creditBalance.upsert({
        where: {
          organizationId_customerId: {
            organizationId: input.organizationId,
            customerId: input.customerId,
          },
        },
        create: {
          organizationId: input.organizationId,
          customerId: input.customerId,
          balance: 0,
        },
        update: {},
      });

      const updated = await tx.$executeRaw`
        UPDATE credit_balances
        SET balance = balance - ${input.cost}
        WHERE organization_id = ${input.organizationId}::uuid
          AND customer_id = ${input.customerId}::uuid
          AND balance >= ${input.cost}
      `;

      if (updated === 0) {
        throw new UnprocessableEntityException({
          code: 'INSUFFICIENT_CREDITS',
          message: 'Insufficient credits',
        });
      }

      const row = await tx.creditBalance.findUniqueOrThrow({
        where: {
          organizationId_customerId: {
            organizationId: input.organizationId,
            customerId: input.customerId,
          },
        },
      });

      await tx.creditLedgerEntry.create({
        data: {
          organizationId: input.organizationId,
          customerId: input.customerId,
          subscriptionId: input.subscriptionId ?? null,
          bookingId: input.bookingId,
          delta: -input.cost,
          balanceAfter: row.balance,
          reason: CreditReason.CONSUME,
        },
      });

      return { balance: row.balance };
    });
  }

  async release(input: ReleaseCreditsInput): Promise<{ balance: number } | null> {
    return this.prisma.$transaction(async (tx) => {
      const consume = await tx.creditLedgerEntry.findFirst({
        where: {
          organizationId: input.organizationId,
          customerId: input.customerId,
          bookingId: input.bookingId,
          reason: CreditReason.CONSUME,
        },
      });
      if (!consume) {
        return null;
      }

      const alreadyReleased = await tx.creditLedgerEntry.findFirst({
        where: {
          organizationId: input.organizationId,
          customerId: input.customerId,
          bookingId: input.bookingId,
          reason: CreditReason.RELEASE,
        },
      });
      if (alreadyReleased) {
        return { balance: alreadyReleased.balanceAfter };
      }

      const cost = Math.abs(consume.delta);
      await tx.creditBalance.upsert({
        where: {
          organizationId_customerId: {
            organizationId: input.organizationId,
            customerId: input.customerId,
          },
        },
        create: {
          organizationId: input.organizationId,
          customerId: input.customerId,
          balance: cost,
        },
        update: {
          balance: { increment: cost },
        },
      });

      const row = await tx.creditBalance.findUniqueOrThrow({
        where: {
          organizationId_customerId: {
            organizationId: input.organizationId,
            customerId: input.customerId,
          },
        },
      });

      await tx.creditLedgerEntry.create({
        data: {
          organizationId: input.organizationId,
          customerId: input.customerId,
          subscriptionId: consume.subscriptionId,
          bookingId: input.bookingId,
          delta: cost,
          balanceAfter: row.balance,
          reason: CreditReason.RELEASE,
        },
      });

      return { balance: row.balance };
    });
  }

  /**
   * Set balance to `grant` (not additive). Leftover credits from the prior
   * period die — delta may be negative.
   */
  async periodReset(input: PeriodResetInput): Promise<{ balance: number }> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.creditBalance.findUnique({
        where: {
          organizationId_customerId: {
            organizationId: input.organizationId,
            customerId: input.customerId,
          },
        },
      });
      const previous = existing?.balance ?? 0;
      const delta = input.grant - previous;

      await tx.creditBalance.upsert({
        where: {
          organizationId_customerId: {
            organizationId: input.organizationId,
            customerId: input.customerId,
          },
        },
        create: {
          organizationId: input.organizationId,
          customerId: input.customerId,
          balance: input.grant,
        },
        update: { balance: input.grant },
      });

      await tx.creditLedgerEntry.create({
        data: {
          organizationId: input.organizationId,
          customerId: input.customerId,
          subscriptionId: input.subscriptionId ?? null,
          delta,
          balanceAfter: input.grant,
          reason: CreditReason.PERIOD_RESET,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
        },
      });

      return { balance: input.grant };
    });
  }

  async getBalance(
    organizationId: string,
    customerId: string,
  ): Promise<number> {
    const row = await this.prisma.creditBalance.findUnique({
      where: {
        organizationId_customerId: { organizationId, customerId },
      },
    });
    return row?.balance ?? 0;
  }
}
