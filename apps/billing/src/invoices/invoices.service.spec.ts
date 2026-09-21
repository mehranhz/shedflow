import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type Stripe from 'stripe';
import { InvoicesService } from './invoices.service';
import type { InvoiceRecord } from './invoice.repository';

describe('InvoicesService (T-023)', () => {
  const ORG = '11111111-1111-4111-8111-111111111111';
  const CUSTOMER = '44444444-4444-4444-8444-444444444444';

  it('upserts invoice from fixture webhook payload', async () => {
    const fixturePath = join(
      __dirname,
      '../../test/fixtures/stripe/invoice.finalized.json',
    );
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
      data: { object: Stripe.Invoice };
    };

    const stored: InvoiceRecord[] = [];
    const outbox = { emit: jest.fn().mockResolvedValue(undefined) };

    const service = new InvoicesService(
      {
        upsertByStripeId: jest.fn().mockImplementation(async (data) => {
          const row: InvoiceRecord = {
            id: 'inv-uuid',
            organizationId: data.organizationId,
            customerId: data.customerId ?? null,
            stripeInvoiceId: data.stripeInvoiceId,
            amountDueMinor: data.amountDueMinor,
            amountPaidMinor: data.amountPaidMinor,
            currency: data.currency,
            status: data.status,
            hostedInvoiceUrl: data.hostedInvoiceUrl ?? null,
            pdfUrl: data.pdfUrl ?? null,
            createdAt: new Date(),
          };
          stored.push(row);
          return row;
        }),
        findByStripeInvoiceId: jest.fn().mockResolvedValue(null),
      } as never,
      {
        findByStripeCustomerId: jest.fn(),
      } as never,
      {
        findByStripeSubscriptionId: jest.fn(),
      } as never,
      outbox as never,
    );

    await service.upsertFromStripe(fixture.data.object);

    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      organizationId: ORG,
      customerId: CUSTOMER,
      stripeInvoiceId: 'in_test_finalized_1',
      amountDueMinor: 2000,
      amountPaidMinor: 0,
      currency: 'USD',
      status: 'open',
      hostedInvoiceUrl: 'https://invoice.stripe.test/in_test_finalized_1',
    });
  });

  it('emits invoice.payment_failed dunning outbox event', async () => {
    const fixturePath = join(
      __dirname,
      '../../test/fixtures/stripe/invoice.payment_failed.json',
    );
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
      data: { object: Stripe.Invoice };
    };
    const outbox = { emit: jest.fn().mockResolvedValue(undefined) };

    const service = new InvoicesService(
      {
        upsertByStripeId: jest.fn().mockResolvedValue({
          id: 'inv',
          organizationId: ORG,
          customerId: CUSTOMER,
          stripeInvoiceId: 'in_test_failed_1',
          amountDueMinor: 2000,
          amountPaidMinor: 0,
          currency: 'USD',
          status: 'open',
          hostedInvoiceUrl: null,
          pdfUrl: null,
          createdAt: new Date(),
        }),
        findByStripeInvoiceId: jest.fn(),
      } as never,
      { findByStripeCustomerId: jest.fn() } as never,
      { findByStripeSubscriptionId: jest.fn() } as never,
      outbox as never,
    );

    await service.applyPaymentFailed(fixture.data.object);

    expect(outbox.emit).toHaveBeenCalledWith(
      'invoice.payment_failed',
      expect.objectContaining({
        organizationId: ORG,
        stripeInvoiceId: 'in_test_failed_1',
      }),
      ORG,
    );
  });
});
