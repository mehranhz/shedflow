import { config } from 'dotenv';
import { resolve } from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DomainEventStatus } from '@shedflow/db';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

config({ path: resolve(__dirname, '../../../.env') });
config({ path: resolve(__dirname, '../../.env') });
config({ path: resolve(__dirname, '../.env') });

async function waitFor(
  predicate: () => Promise<boolean>,
  timeoutMs = 15_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  }
  throw new Error('timed out waiting for worker');
}

describe('Worker (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(() => {
    process.env.INTERNAL_API_SECRET ??= 'test-internal-secret';
    process.env.PORT ??= '3003';
    process.env.OUTBOX_BACKOFF_MS = '50';
    process.env.OUTBOX_MAX_ATTEMPTS = '3';
    process.env.OUTBOX_RELAY_INTERVAL_MS = '200';
    if (process.env.TEST_DATABASE_URL) {
      process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    }
  });

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.domainEvent.deleteMany();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /health is 200', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.db).toBe(true);
  });

  it('relays a domain_events row to PROCESSED', async () => {
    const created = await prisma.domainEvent.create({
      data: {
        type: 'organization.created',
        payload: { ping: true },
        status: DomainEventStatus.PENDING,
      },
    });

    await waitFor(async () => {
      const row = await prisma.domainEvent.findUnique({
        where: { id: created.id },
      });
      return row?.status === DomainEventStatus.PROCESSED;
    });
  });

  it('marks a poison payload FAILED and keeps serving health', async () => {
    const created = await prisma.domainEvent.create({
      data: {
        type: 'test.poison',
        payload: { poison: true },
        status: DomainEventStatus.PENDING,
      },
    });

    await waitFor(async () => {
      const row = await prisma.domainEvent.findUnique({
        where: { id: created.id },
      });
      return row?.status === DomainEventStatus.FAILED;
    }, 20_000);

    const failed = await prisma.domainEvent.findUnique({
      where: { id: created.id },
    });
    expect(failed?.attempts).toBeGreaterThanOrEqual(3);
    expect(failed?.lastError).toContain('poison');

    await request(app.getHttpServer()).get('/health').expect(200);
  });
});
