import { randomUUID } from 'node:crypto';
import { UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreditReason } from '@shedflow/db';
import { PrismaService } from '../prisma/prisma.service';
import { CreditsService } from './credits.service';

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CUSTOMER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function databaseUrl(): string {
  return (
    process.env.TEST_DATABASE_URL ??
    process.env.DATABASE_URL ??
    'postgresql://shedflow:shedflow@localhost:5434/shedflow?schema=public'
  );
}

describe('CreditsService (T-022)', () => {
  let prisma: PrismaService;
  let credits: CreditsService;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl();
    const config = {
      getOrThrow: (key: string) => {
        if (key === 'DATABASE_URL') {
          return databaseUrl();
        }
        throw new Error(`missing ${key}`);
      },
    } as unknown as ConfigService;
    prisma = new PrismaService(config);
    await prisma.$connect();
    credits = new CreditsService(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.creditLedgerEntry.deleteMany({
      where: { organizationId: ORG, customerId: CUSTOMER },
    });
    await prisma.creditBalance.deleteMany({
      where: { organizationId: ORG, customerId: CUSTOMER },
    });
  });

  it('two concurrent consumes with balance 1 → exactly one success', async () => {
    await prisma.creditBalance.create({
      data: { organizationId: ORG, customerId: CUSTOMER, balance: 1 },
    });

    const bookingA = randomUUID();
    const bookingB = randomUUID();

    const results = await Promise.allSettled([
      credits.consume({
        organizationId: ORG,
        customerId: CUSTOMER,
        bookingId: bookingA,
        cost: 1,
      }),
      credits.consume({
        organizationId: ORG,
        customerId: CUSTOMER,
        bookingId: bookingB,
        cost: 1,
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const err = (rejected[0] as PromiseRejectedResult).reason;
    expect(err).toBeInstanceOf(UnprocessableEntityException);
    expect((err as UnprocessableEntityException).getResponse()).toMatchObject({
      code: 'INSUFFICIENT_CREDITS',
    });

    expect(await credits.getBalance(ORG, CUSTOMER)).toBe(0);
  });

  it('release after consume restores balance', async () => {
    await prisma.creditBalance.create({
      data: { organizationId: ORG, customerId: CUSTOMER, balance: 2 },
    });
    const bookingId = randomUUID();

    await credits.consume({
      organizationId: ORG,
      customerId: CUSTOMER,
      bookingId,
      cost: 1,
    });
    expect(await credits.getBalance(ORG, CUSTOMER)).toBe(1);

    await credits.release({
      organizationId: ORG,
      customerId: CUSTOMER,
      bookingId,
    });
    expect(await credits.getBalance(ORG, CUSTOMER)).toBe(2);

    const releaseRows = await prisma.creditLedgerEntry.findMany({
      where: { bookingId, reason: CreditReason.RELEASE },
    });
    expect(releaseRows).toHaveLength(1);
  });

  it('period reset sets balance to grant (leftover does not roll over)', async () => {
    await prisma.creditBalance.create({
      data: { organizationId: ORG, customerId: CUSTOMER, balance: 7 },
    });

    const result = await credits.periodReset({
      organizationId: ORG,
      customerId: CUSTOMER,
      grant: 5,
      periodStart: new Date('2026-01-01T00:00:00Z'),
      periodEnd: new Date('2026-02-01T00:00:00Z'),
    });

    expect(result.balance).toBe(5);
    expect(await credits.getBalance(ORG, CUSTOMER)).toBe(5);

    const row = await prisma.creditLedgerEntry.findFirst({
      where: {
        organizationId: ORG,
        customerId: CUSTOMER,
        reason: CreditReason.PERIOD_RESET,
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(row?.delta).toBe(-2); // 5 - 7
    expect(row?.balanceAfter).toBe(5);
  });
});
