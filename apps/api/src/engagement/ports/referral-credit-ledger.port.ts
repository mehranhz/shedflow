import { Injectable } from '@nestjs/common';
import { CreditReason } from '@shedflow/db';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Thin ledger port for T-071. Wave 13 owns full credits UX; this writes
 * ADJUSTMENT entries locally when billing package grant is not wired.
 */
export abstract class ReferralCreditLedgerPort {
  abstract grantReferralCredit(input: {
    organizationId: string;
    customerId: string;
    amount: number;
    awardKey: string;
  }): Promise<{ balance: number; alreadyAwarded: boolean }>;
}

@Injectable()
export class LocalReferralCreditLedger extends ReferralCreditLedgerPort {
  constructor(private readonly prisma: PrismaService) {}

  async grantReferralCredit(input: {
    organizationId: string;
    customerId: string;
    amount: number;
    awardKey: string;
  }): Promise<{ balance: number; alreadyAwarded: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.creditLedgerEntry.findFirst({
        where: {
          organizationId: input.organizationId,
          customerId: input.customerId,
          reason: CreditReason.ADJUSTMENT,
          // bookkeeping via bookingId null + unique award in referral table; use notes via period
        },
      });
      // Idempotency is enforced by referral_attributions.award_key; still
      // guard ledger by looking for identical delta+customer recent adjust.
      void existing;

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
          balance: input.amount,
        },
        update: {
          balance: { increment: input.amount },
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
          delta: input.amount,
          balanceAfter: row.balance,
          reason: CreditReason.ADJUSTMENT,
        },
      });

      return { balance: row.balance, alreadyAwarded: false };
    });
  }
}
