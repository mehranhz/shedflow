import { PaymentStatus, PlatformPlan, Role } from '@shedflow/db';
import { DOMAIN_EVENTS } from '@shedflow/shared';
import { InMemoryPaymentGateway } from '../payments/in-memory-payment-gateway';
import { RefundsService } from './refunds.service';
import type { PaymentRecord } from '../checkout/payment.repository';
import type { RefundRecord } from './refund.repository';

describe('RefundsService (T-023)', () => {
  const ORG = '11111111-1111-4111-8111-111111111111';
  const PAYMENT_ID = '22222222-2222-4222-8222-222222222222';
  const USER = {
    userId: '33333333-3333-4333-8333-333333333333',
    email: 'owner@example.com',
    orgId: ORG,
  };

  function payment(overrides: Partial<PaymentRecord> = {}): PaymentRecord {
    const now = new Date();
    return {
      id: PAYMENT_ID,
      organizationId: ORG,
      customerId: '44444444-4444-4444-8444-444444444444',
      bookingId: '55555555-5555-4555-8555-555555555555',
      stripeCheckoutSessionId: 'cs_1',
      stripePaymentIntentId: 'pi_1',
      amountMinor: 5000,
      currency: 'USD',
      applicationFeeMinor: 100,
      status: PaymentStatus.SUCCEEDED,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  }

  it('refunds via fake gateway and marks payment REFUNDED', async () => {
    const gateway = new InMemoryPaymentGateway();
    const outbox = { emit: jest.fn().mockResolvedValue(undefined) };
    let current = payment();
    const refunds: RefundRecord[] = [];

    const service = new RefundsService(
      {
        organization: {
          findFirst: jest.fn().mockResolvedValue({
            id: ORG,
            platformPlan: PlatformPlan.PRO,
            deletedAt: null,
          }),
        },
        membership: {
          findFirst: jest.fn().mockResolvedValue({
            role: Role.OWNER,
            status: 'ACTIVE',
          }),
        },
        payment: { findFirst: jest.fn() },
      } as never,
      {
        findById: jest.fn().mockImplementation(async () => current),
        updateStatus: jest.fn().mockImplementation(async (_id, status) => {
          current = { ...current, status };
          return current;
        }),
      } as never,
      {
        create: jest.fn().mockImplementation(async (data) => {
          const row = {
            id: 'refund-1',
            paymentId: data.paymentId,
            amountMinor: data.amountMinor,
            stripeRefundId: data.stripeRefundId,
            reason: data.reason ?? null,
            createdAt: new Date(),
          };
          refunds.push(row);
          return row;
        }),
        sumByPaymentId: jest.fn().mockImplementation(async () =>
          refunds.reduce((sum, r) => sum + r.amountMinor, 0),
        ),
        findByStripeRefundId: jest.fn().mockResolvedValue(null),
      } as never,
      {
        findByOrganizationId: jest.fn().mockResolvedValue({
          organizationId: ORG,
          stripeAccountId: 'acct_1',
          chargesEnabled: true,
        }),
      } as never,
      gateway,
      outbox as never,
    );

    const result = await service.create(ORG, PAYMENT_ID, USER, {});

    expect(result.payment.status).toBe(PaymentStatus.REFUNDED);
    expect(
      gateway.calls.some((c) => c.method === 'createRefund'),
    ).toBe(true);
    expect(outbox.emit).toHaveBeenCalledWith(
      DOMAIN_EVENTS.PaymentRefunded,
      expect.objectContaining({ paymentId: PAYMENT_ID, amountMinor: 5000 }),
      ORG,
    );
  });

  it('partial refund sets PARTIALLY_REFUNDED', async () => {
    const gateway = new InMemoryPaymentGateway();
    const outbox = { emit: jest.fn().mockResolvedValue(undefined) };
    let current = payment();
    const refunds: RefundRecord[] = [];

    const service = new RefundsService(
      {
        organization: {
          findFirst: jest.fn().mockResolvedValue({
            id: ORG,
            platformPlan: PlatformPlan.PRO,
            deletedAt: null,
          }),
        },
        membership: {
          findFirst: jest.fn().mockResolvedValue({
            role: Role.ADMIN,
            status: 'ACTIVE',
          }),
        },
        payment: { findFirst: jest.fn() },
      } as never,
      {
        findById: jest.fn().mockImplementation(async () => current),
        updateStatus: jest.fn().mockImplementation(async (_id, status) => {
          current = { ...current, status };
          return current;
        }),
      } as never,
      {
        create: jest.fn().mockImplementation(async (data) => {
          const row = {
            id: 'refund-partial',
            paymentId: data.paymentId,
            amountMinor: data.amountMinor,
            stripeRefundId: data.stripeRefundId,
            reason: data.reason ?? null,
            createdAt: new Date(),
          };
          refunds.push(row);
          return row;
        }),
        sumByPaymentId: jest.fn().mockImplementation(async () =>
          refunds.reduce((sum, r) => sum + r.amountMinor, 0),
        ),
        findByStripeRefundId: jest.fn().mockResolvedValue(null),
      } as never,
      {
        findByOrganizationId: jest.fn().mockResolvedValue({
          organizationId: ORG,
          stripeAccountId: 'acct_1',
          chargesEnabled: true,
        }),
      } as never,
      gateway,
      outbox as never,
    );

    const result = await service.create(ORG, PAYMENT_ID, USER, {
      amountMinor: 2000,
      reason: 'requested_by_customer',
    });

    expect(result.payment.status).toBe(PaymentStatus.PARTIALLY_REFUNDED);
    expect(result.refund.amountMinor).toBe(2000);
    expect(gateway.calls[0]?.args[1]).toBe(2000);
  });
});
