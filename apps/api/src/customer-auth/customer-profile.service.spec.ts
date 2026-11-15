import { Logger } from '@nestjs/common';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DOMAIN_EVENTS } from '@shedflow/shared';
import { Clock } from '../common/clock/clock';
import { TransactionManager } from '../common/persistence';
import { Outbox } from '../domain-events/outbox';
import { PrismaService } from '../prisma/prisma.service';
import {
  CustomerProfileService,
  profileEtag,
} from './customer-profile.service';

type Row = Record<string, unknown> & { id: string };

class FixedClock extends Clock {
  now(): Date {
    return new Date('2026-11-15T08:00:00.000Z');
  }
}

class MemoryDb {
  users: Row[] = [];
  customers: Row[] = [];
  bookings: Row[] = [];
  tokens: Row[] = [];
  forms: Row[] = [];

  activeClient(): MemoryDb {
    return this;
  }

  user = {
    findFirst: async ({ where }: { where?: Record<string, unknown> }) =>
      this.users.find((row) => matches(row, where)) ?? null,
    updateMany: async ({
      where,
      data,
    }: {
      where?: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => this.update('users', where, data),
  };

  customer = {
    findMany: async ({ where }: { where?: Record<string, unknown> }) =>
      this.customers.filter((row) => matches(row, where)),
    updateMany: async ({
      where,
      data,
    }: {
      where?: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => this.update('customers', where, data),
    deleteMany: async ({ where }: { where?: Record<string, unknown> }) => {
      const doomed = this.customers.filter((row) => matches(row, where));
      this.customers = this.customers.filter((row) => !matches(row, where));
      return { count: doomed.length };
    },
  };

  booking = {
    updateMany: async ({
      where,
      data,
    }: {
      where?: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => this.update('bookings', where, data, false),
  };

  formAssignment = {
    updateMany: async ({
      where,
      data,
    }: {
      where?: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => this.update('forms', where, data, false),
  };

  formSubmission = {
    updateMany: async () => ({ count: 0 }),
  };

  emailChangeToken = {
    findFirst: async ({ where }: { where?: Record<string, unknown> }) =>
      this.tokens.find((row) => matches(row, where)) ?? null,
    updateMany: async ({
      where,
      data,
    }: {
      where?: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => this.update('tokens', where, data, false),
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const row: Row = {
        id: randomUUID(),
        usedAt: null,
        createdAt: new Date(),
        ...data,
      };
      this.tokens.push(row);
      return row;
    },
  };

  private update(
    table: 'users' | 'customers' | 'bookings' | 'tokens' | 'forms',
    where: Record<string, unknown> | undefined,
    data: Record<string, unknown>,
    bumpUpdatedAt = true,
  ): { count: number } {
    const rows = this[table].filter((row) => matches(row, where));
    const stamp = new Date('2026-11-15T08:05:00.000Z');
    for (const row of rows) {
      Object.assign(row, data);
      if (bumpUpdatedAt) {
        row.updatedAt = stamp;
      }
    }
    return { count: rows.length };
  }
}

function matches(row: Row, where?: Record<string, unknown>): boolean {
  if (!where) {
    return true;
  }
  for (const [key, expected] of Object.entries(where)) {
    if (key === 'NOT') {
      const excluded = expected as { id?: string };
      if (excluded?.id && row.id === excluded.id) {
        return false;
      }
      continue;
    }
    if (
      expected &&
      typeof expected === 'object' &&
      !(expected instanceof Date) &&
      'equals' in (expected as Record<string, unknown>)
    ) {
      const equals = String((expected as { equals: string }).equals).toLowerCase();
      const actual = typeof row[key] === 'string' ? String(row[key]).toLowerCase() : null;
      if (actual !== equals) {
        return false;
      }
      continue;
    }
    const actual = row[key];
    if (expected instanceof Date || actual instanceof Date) {
      const left = actual instanceof Date ? actual.getTime() : Number.NaN;
      const right = expected instanceof Date ? expected.getTime() : Date.parse(String(expected));
      if (left !== right) {
        return false;
      }
      continue;
    }
    if (actual !== expected) {
      return false;
    }
  }
  return true;
}

describe('customer profile API validation (T-055)', () => {
  const userId = '11111111-1111-1111-1111-111111111111';
  const orgId = '22222222-2222-2222-2222-222222222222';
  const otherOrgId = '33333333-3333-3333-3333-333333333333';
  const thirdOrgId = '44444444-4444-4444-4444-444444444444';
  const updatedAt = new Date('2026-11-15T07:00:00.000Z');
  let db: MemoryDb;
  let service: CustomerProfileService;
  let outbox: { emit: jest.Mock };
  let logs: string[];
  let tx: TransactionManager;

  beforeEach(() => {
    logs = [];
    jest.spyOn(Logger.prototype, 'log').mockImplementation((message: unknown) => {
      logs.push(String(message));
    });
    db = new MemoryDb();
    db.users.push({
      id: userId,
      email: 'ada@example.com',
      name: 'Ada',
      phone: null,
      photoUrl: null,
      timezone: 'UTC',
      locale: 'en',
      emailVerifiedAt: updatedAt,
      deletedAt: null,
      updatedAt,
    });
    db.customers.push(
      customer('c-acme', orgId, userId, 'ada@example.com', 'Ada'),
      customer('c-other', otherOrgId, userId, 'ada@example.com', 'Ada at Beta'),
    );
    const transactions = {
      depth: 0,
      isInTransaction() {
        return this.depth > 0;
      },
      async runInTransaction<T>(work: () => Promise<T>): Promise<T> {
        this.depth += 1;
        try {
          return await work();
        } finally {
          this.depth -= 1;
        }
      },
    };
    tx = transactions as unknown as TransactionManager;
    outbox = {
      emit: jest.fn(async () => {
        if (!transactions.isInTransaction()) {
          throw new Error('Outbox.emit must be called inside a transaction');
        }
        return { id: 'evt' };
      }),
    };
    service = new CustomerProfileService(
      db as unknown as PrismaService,
      tx,
      outbox as unknown as Outbox,
      new FixedClock(),
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects an invalid phone and timezone with field errors', async () => {
    await expect(
      service.update(userId, orgId, {
        phone: '12345',
        timezone: 'Not/AZone',
        updatedAt: updatedAt.toISOString(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    try {
      await service.update(userId, orgId, {
        phone: '12345',
        timezone: 'Not/AZone',
        updatedAt: updatedAt.toISOString(),
      });
    } catch (error) {
      const body = (error as BadRequestException).getResponse() as {
        fieldErrors: Record<string, string[]>;
      };
      expect(body.fieldErrors.phone?.[0]).toMatch(/invalid phone/i);
      expect(body.fieldErrors.timezone?.[0]).toMatch(/timezone/i);
    }
    expect(outbox.emit).not.toHaveBeenCalled();
    expect(db.users[0]?.phone).toBeNull();
  });

  it('rejects a stale updatedAt and a mismatched If-Match', async () => {
    await expect(
      service.update(userId, orgId, {
        name: 'Ada Lovelace',
        updatedAt: '2020-01-01T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    await expect(
      service.update(
        userId,
        orgId,
        { name: 'Ada Lovelace', updatedAt: updatedAt.toISOString() },
        'W/"2020-01-01T00:00:00.000Z"',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.users[0]?.name).toBe('Ada');
    expect(outbox.emit).not.toHaveBeenCalled();
  });

  it('saves the account name onto following customers, which future bookings use as the invitee name', async () => {
    const acme = db.customers[0]!;
    const saved = await service.update(
      userId,
      orgId,
      {
        name: 'Ada Lovelace',
        phone: '+1 (415) 555-2671',
        photoUrl: 'https://cdn.example/ada.png',
        timezone: 'Asia/Tehran',
        locale: 'fa',
        updatedAt: updatedAt.toISOString(),
        business: {
          name: 'Ada Lovelace',
          updatedAt: (acme.updatedAt as Date).toISOString(),
        },
      },
      profileEtag(updatedAt),
    );

    expect(saved.user.name).toBe('Ada Lovelace');
    expect(saved.user.phone).toBe('+14155552671');
    expect(saved.user.photoUrl).toBe('https://cdn.example/ada.png');
    expect(saved.user.timezone).toBe('Asia/Tehran');
    expect(saved.user.locale).toBe('fa');
    expect(saved.businessProfile?.name).toBe('Ada Lovelace');
    // createForLinkedCustomer copies Customer.name onto the invitee.
    expect(db.customers.find((row) => row.id === 'c-acme')?.name).toBe('Ada Lovelace');
    expect(db.customers.find((row) => row.id === 'c-other')?.name).toBe('Ada at Beta');
    expect(outbox.emit).toHaveBeenCalledWith(
      DOMAIN_EVENTS.CustomerProfileUpdated,
      expect.objectContaining({ userId, fields: expect.arrayContaining(['name', 'business']) }),
      orgId,
    );
  });

  it('keeps a per-business display name when the account name changes and no override is sent', async () => {
    await service.update(userId, orgId, {
      name: 'Ada Lovelace',
      updatedAt: updatedAt.toISOString(),
    });
    expect(db.customers.find((row) => row.id === 'c-acme')?.name).toBe('Ada Lovelace');
    expect(db.customers.find((row) => row.id === 'c-other')?.name).toBe('Ada at Beta');
  });

  it('lets the active business override the name future bookings will copy', async () => {
    const acme = db.customers[0]!;
    await service.update(userId, orgId, {
      updatedAt: updatedAt.toISOString(),
      business: {
        name: 'Ada at Acme',
        phone: '+989121234567',
        updatedAt: (acme.updatedAt as Date).toISOString(),
      },
    });
    const row = db.customers.find((item) => item.id === 'c-acme');
    expect(row?.name).toBe('Ada at Acme');
    expect(row?.phone).toBe('+989121234567');
    expect(db.users[0]?.name).toBe('Ada');
  });

  it('does not change the email until the verification token is confirmed, then merges customers', async () => {
    db.customers.push(
      customer('c-guest', orgId, null, 'new@example.com', 'Guest'),
      customer('c-claim', thirdOrgId, null, 'new@example.com', 'Claim me'),
    );
    db.bookings.push({
      id: 'b1',
      customerId: 'c-guest',
      organizationId: orgId,
    });

    await service.requestEmailChange(userId, {
      email: 'New@Example.com',
      updatedAt: updatedAt.toISOString(),
    });
    expect(db.users[0]?.email).toBe('ada@example.com');
    expect(db.tokens).toHaveLength(1);
    expect(db.tokens[0]?.email).toBe('new@example.com');
    expect(outbox.emit).toHaveBeenCalledWith(
      DOMAIN_EVENTS.CustomerEmailChangeRequested,
      { userId, email: 'new@example.com' },
      null,
    );

    const token = logs.join('\n').match(/emailToken=([^\s]+)/)?.[1];
    expect(token).toBeTruthy();
    await service.confirmEmailChange(userId, token!);

    expect(db.users[0]?.email).toBe('new@example.com');
    expect(db.customers.find((row) => row.id === 'c-guest')).toBeUndefined();
    expect(db.bookings[0]?.customerId).toBe('c-acme');
    expect(db.customers.find((row) => row.id === 'c-acme')?.email).toBe('new@example.com');
    const claimed = db.customers.find((row) => row.id === 'c-claim');
    expect(claimed?.userId).toBe(userId);
    expect(claimed?.email).toBe('new@example.com');
    expect(outbox.emit).toHaveBeenCalledWith(
      DOMAIN_EVENTS.CustomerEmailChanged,
      { userId, email: 'new@example.com' },
      null,
    );
  });

  it('refuses to take an email that another user already owns on a customer row', async () => {
    db.customers.push(customer('c-theirs', orgId, 'someone-else', 'taken@example.com', 'Them'));
    await service.requestEmailChange(userId, {
      email: 'taken@example.com',
      updatedAt: updatedAt.toISOString(),
    });
    const token = logs.join('\n').match(/emailToken=([^\s]+)/)?.[1];
    await expect(service.confirmEmailChange(userId, token!)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(db.users[0]?.email).toBe('ada@example.com');
    expect(db.tokens[0]?.usedAt).toBeNull();
  });
});

function customer(
  id: string,
  organizationId: string,
  userId: string | null,
  email: string,
  name: string,
): Row {
  return {
    id,
    organizationId,
    userId,
    email,
    name,
    phone: null,
    updatedAt: new Date('2026-11-15T07:00:00.000Z'),
    organization: {
      id: organizationId,
      slug: organizationId === '22222222-2222-2222-2222-222222222222' ? 'acme' : 'beta',
      name: organizationId === '22222222-2222-2222-2222-222222222222' ? 'Acme' : 'Beta',
      brandColor: null,
      logoUrl: null,
    },
    bookings: [],
  };
}
