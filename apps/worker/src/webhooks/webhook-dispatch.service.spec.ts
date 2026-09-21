import { createCipheriv, randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { ConfigService } from '@nestjs/config';
import { WebhookDeliveryStatus } from '@shedflow/db';
import { PrismaService } from '../prisma/prisma.service';
import { PgBossService } from '../queue/pg-boss.service';
import { WebhookDispatchService } from './webhook-dispatch.service';

jest.mock('../queue/pg-boss.service', () => ({
  PgBossService: class PgBossService {},
}));

jest.mock('@shedflow/shared', () => {
  const actual = jest.requireActual(
    '@shedflow/shared',
  ) as typeof import('@shedflow/shared');
  return {
    ...actual,
    assertSafeWebhookUrlResolved: jest.fn(async (url: string) => new URL(url)),
  };
});

function encryptSecret(plaintext: string, hexKey: string): Buffer {
  const key = Buffer.from(hexKey, 'hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]);
}

describe('WebhookDispatchService', () => {
  let server: Server;
  let received: { headers: IncomingMessage['headers']; body: string } | null;
  let baseUrl: string;

  beforeAll(async () => {
    received = null;
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c as Buffer));
      req.on('end', () => {
        received = {
          headers: req.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        };
        res.statusCode = 200;
        res.end('ok');
      });
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}/hook`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it('POSTs a signed payload and marks SUCCESS', async () => {
    const encKey = 'ab'.repeat(32);
    const secretEnc = encryptSecret('whsec_testsecret', encKey);
    const deliveryId = '11111111-1111-4111-8111-111111111111';
    const eventId = '22222222-2222-4222-8222-222222222222';
    const endpointId = '33333333-3333-4333-8333-333333333333';

    const prisma = {
      webhookDelivery: {
        findUnique: jest.fn().mockResolvedValue({
          id: deliveryId,
          endpointId,
          eventId,
          status: WebhookDeliveryStatus.PENDING,
          attempt: 0,
          endpoint: {
            id: endpointId,
            url: baseUrl,
            isActive: true,
            secretEnc,
            events: ['*'],
          },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      domainEvent: {
        findUnique: jest.fn().mockResolvedValue({
          id: eventId,
          type: 'booking.confirmed',
          organizationId: 'org',
          payload: { bookingId: 'b1' },
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      },
    };

    const boss = {
      enqueueJob: jest.fn(),
      ensureQueue: jest.fn(),
    };
    const config = {
      get: (key: string) =>
        key === 'TOKEN_ENCRYPTION_KEY' ? encKey : undefined,
    };

    const service = new WebhookDispatchService(
      prisma as unknown as PrismaService,
      boss as unknown as PgBossService,
      config as unknown as ConfigService,
    );

    await service.dispatch({ deliveryId });

    expect(received).not.toBeNull();
    expect(received!.headers['x-schedflow-event']).toBe('booking.confirmed');
    expect(received!.headers['x-schedflow-signature']).toMatch(/^v1=/);
    expect(prisma.webhookDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: deliveryId },
        data: expect.objectContaining({
          status: WebhookDeliveryStatus.SUCCESS,
        }),
      }),
    );
  });
});
