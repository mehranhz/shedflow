import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { CreditReason, GiftCardStatus } from '@shedflow/db';
import { FEATURE_FLAGS, isEnabled } from '@shedflow/shared';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

export type RedeemGiftCardInput = {
  organizationId: string;
  customerId: string;
  code: string;
};

/**
 * Gift cards → store credit (T-065). Gated by `customer_gift_cards`.
 */
@Injectable()
export class GiftCardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  isFlagEnabled(orgSettings?: unknown): boolean {
    return isEnabled(
      FEATURE_FLAGS.customerGiftCards,
      orgSettings ? { settings: orgSettings } : null,
      this.config.get<string>('FLAGS'),
    );
  }

  async createForTests(input: {
    organizationId: string;
    creditAmount: number;
    code?: string;
  }): Promise<{ id: string; code: string }> {
    const code =
      input.code?.trim().toUpperCase() ??
      `GIFT-${randomBytes(4).toString('hex').toUpperCase()}`;
    const codeHash = hashCode(code);
    const row = await this.prisma.giftCard.create({
      data: {
        organizationId: input.organizationId,
        codeHash,
        codePrefix: code.slice(0, 8),
        creditAmount: input.creditAmount,
        status: GiftCardStatus.ACTIVE,
      },
    });
    return { id: row.id, code };
  }

  async redeem(input: RedeemGiftCardInput): Promise<{ balance: number }> {
    const org = await this.prisma.organization.findFirst({
      where: { id: input.organizationId, deletedAt: null },
    });
    if (!this.isFlagEnabled(org?.settings)) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Gift cards are not enabled',
      });
    }

    const code = input.code.trim().toUpperCase();
    const codeHash = hashCode(code);

    return this.prisma.$transaction(async (tx) => {
      const card = await tx.giftCard.findUnique({
        where: {
          organizationId_codeHash: {
            organizationId: input.organizationId,
            codeHash,
          },
        },
      });
      if (!card || card.status === GiftCardStatus.DISABLED) {
        throw new NotFoundException({
          code: 'GIFT_CARD_NOT_FOUND',
          message: 'Gift card not found',
        });
      }
      if (card.status === GiftCardStatus.REDEEMED) {
        throw new UnprocessableEntityException({
          code: 'GIFT_CARD_ALREADY_REDEEMED',
          message: 'Gift card already redeemed',
        });
      }
      if (card.expiresAt && card.expiresAt.getTime() <= Date.now()) {
        throw new UnprocessableEntityException({
          code: 'GIFT_CARD_EXPIRED',
          message: 'Gift card expired',
        });
      }

      const updated = await tx.giftCard.updateMany({
        where: {
          id: card.id,
          status: GiftCardStatus.ACTIVE,
        },
        data: {
          status: GiftCardStatus.REDEEMED,
          redeemedByCustomerId: input.customerId,
          redeemedAt: new Date(),
        },
      });
      if (updated.count === 0) {
        throw new UnprocessableEntityException({
          code: 'GIFT_CARD_ALREADY_REDEEMED',
          message: 'Gift card already redeemed',
        });
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
          balance: card.creditAmount,
        },
        update: { balance: { increment: card.creditAmount } },
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
          delta: card.creditAmount,
          balanceAfter: row.balance,
          reason: CreditReason.GIFT_REDEEM,
        },
      });

      return { balance: row.balance };
    });
  }
}

function hashCode(code: string): string {
  return createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}
