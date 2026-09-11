import { config } from 'dotenv';
import { resolve } from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PrismaService } from './../src/prisma/prisma.service';
import { UsersService } from './../src/users/users.service';

config({ path: resolve(__dirname, '../../../.env') });
config({ path: resolve(__dirname, '../../.env') });
config({ path: resolve(__dirname, '../.env') });

describe('Organizations (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let users: UsersService;

  beforeAll(() => {
    process.env.JWT_SECRET ??= 'test-secret';
    process.env.APP_URL ??= 'http://localhost:3000';
    if (process.env.TEST_DATABASE_URL) {
      process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    }
  });

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    users = app.get(UsersService);
    await prisma.user.deleteMany();
    await prisma.organization.deleteMany();
  });

  afterEach(async () => {
    await app.close();
  });

  async function register(email: string, password = 'password123') {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password })
      .expect(201);
    return response.body as {
      accessToken: string;
      user: { id: string; email: string };
    };
  }

  function decodeJwt(token: string): { orgId?: string; role?: string } {
    const payloadPart = token.split('.')[1];
    if (!payloadPart) {
      throw new Error('missing JWT payload');
    }
    return JSON.parse(
      Buffer.from(payloadPart, 'base64url').toString('utf8'),
    ) as { orgId?: string; role?: string };
  }

  function createOrg(
    accessToken: string,
    body: object,
    key = randomUUID(),
  ) {
    return request(app.getHttpServer())
      .post('/v1/organizations')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', key)
      .send(body);
  }

  it('returns an empty list when the user has no organizations', async () => {
    await users.create(
      'solo@example.com',
      await bcrypt.hash('password123', 10),
    );
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'solo@example.com', password: 'password123' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get('/v1/organizations')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);
    expect(response.body).toEqual([]);
  });

  it('lets a user without an organization create one', async () => {
    await users.create(
      'legacy@example.com',
      await bcrypt.hash('password123', 10),
    );
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'legacy@example.com', password: 'password123' })
      .expect(201);

    const created = await createOrg(login.body.accessToken, {
      name: 'Late Start',
    }).expect(201);
    expect(created.body.name).toBe('Late Start');
  });

  it('switches the access JWT orgId between memberships', async () => {
    const owner = await register('multi@example.com');
    const firstOrgId = decodeJwt(owner.accessToken).orgId;
    expect(firstOrgId).toEqual(expect.any(String));

    const second = await createOrg(owner.accessToken, {
      name: 'Second Desk',
    }).expect(201);

    const switched = await request(app.getHttpServer())
      .post(`/v1/organizations/${second.body.id}/switch`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(201);

    expect(switched.body.organizationId).toBe(second.body.id);
    expect(switched.body.role).toBe('OWNER');
    expect(switched.body.accessToken).toEqual(expect.any(String));

    const payload = decodeJwt(switched.body.accessToken);
    expect(payload.orgId).toBe(second.body.id);
    expect(payload.orgId).not.toBe(firstOrgId);

    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${switched.body.accessToken}`)
      .expect(200);
    expect(me.body.activeOrganization.id).toBe(second.body.id);
    expect(me.body.memberships).toHaveLength(2);
  });

  it('creates an organization with the caller as OWNER', async () => {
    const { accessToken, user } = await register('owner@example.com');
    const created = await createOrg(accessToken, {
      name: 'Acme',
      timezone: 'America/New_York',
    }).expect(201);

    expect(created.body.name).toBe('Acme');
    expect(created.body.slug).toBe('acme');
    expect(created.body.timezone).toBe('America/New_York');

    const members = await request(app.getHttpServer())
      .get(`/v1/organizations/${created.body.id}/members`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(members.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: user.id,
          role: 'OWNER',
          email: 'owner@example.com',
        }),
      ]),
    );
  });

  it('lets an invited ADMIN list members and forbids a MEMBER from PATCHing the slug', async () => {
    const owner = await register('owner@example.com');
    const admin = await register('admin@example.com');
    const member = await register('member@example.com');

    const org = await createOrg(owner.accessToken, { name: 'Acme' }).expect(201);

    const adminInvite = await request(app.getHttpServer())
      .post(`/v1/organizations/${org.body.id}/invitations`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ email: admin.user.email, role: 'ADMIN' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/v1/invitations/${encodeURIComponent(adminInvite.body.token)}/accept`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);

    const listed = await request(app.getHttpServer())
      .get(`/v1/organizations/${org.body.id}/members`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(listed.body).toHaveLength(2);

    const memberInvite = await request(app.getHttpServer())
      .post(`/v1/organizations/${org.body.id}/invitations`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ email: member.user.email, role: 'MEMBER' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/v1/invitations/${encodeURIComponent(memberInvite.body.token)}/accept`)
      .set('Authorization', `Bearer ${member.accessToken}`)
      .expect(200);

    const forbidden = await request(app.getHttpServer())
      .patch(`/v1/organizations/${org.body.id}`)
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send({ slug: 'hacked' })
      .expect(403);
    expect(forbidden.body.error.code).toBe('FORBIDDEN');
  });

  it('hides another organization behind 404 rather than 403', async () => {
    const ownerA = await register('a@example.com');
    const ownerB = await register('b@example.com');

    const orgA = await createOrg(ownerA.accessToken, { name: 'Alpha' }).expect(
      201,
    );

    await createOrg(ownerB.accessToken, { name: 'Beta' }).expect(201);

    const hidden = await request(app.getHttpServer())
      .get(`/v1/organizations/${orgA.body.id}`)
      .set('Authorization', `Bearer ${ownerB.accessToken}`)
      .expect(404);
    expect(hidden.body.error.code).toBe('NOT_FOUND');
  });

  it('returns SLUG_TAKEN when PATCHing to an existing slug', async () => {
    const ownerA = await register('a@example.com');
    const ownerB = await register('b@example.com');

    await createOrg(ownerA.accessToken, { name: 'Acme' }).expect(201);

    const orgB = await createOrg(ownerB.accessToken, { name: 'Other' }).expect(
      201,
    );

    const conflict = await request(app.getHttpServer())
      .patch(`/v1/organizations/${orgB.body.id}`)
      .set('Authorization', `Bearer ${ownerB.accessToken}`)
      .send({ slug: 'acme' })
      .expect(409);
    expect(conflict.body.error.code).toBe('SLUG_TAKEN');
  });

  it('replays POST /v1/organizations for the same Idempotency-Key and body', async () => {
    const { accessToken } = await register('idem@example.com');
    const key = randomUUID();
    const first = await createOrg(
      accessToken,
      { name: 'Replayable' },
      key,
    ).expect(201);
    const second = await createOrg(
      accessToken,
      { name: 'Replayable' },
      key,
    ).expect(201);

    expect(second.body).toEqual(first.body);
    const named = await prisma.organization.findMany({
      where: { name: 'Replayable' },
    });
    expect(named).toHaveLength(1);
  });

  it('returns IDEMPOTENCY_MISMATCH when the same key is reused with a different body', async () => {
    const { accessToken } = await register('mismatch@example.com');
    const key = randomUUID();
    await createOrg(accessToken, { name: 'Alpha Desk' }, key).expect(201);

    const conflict = await createOrg(
      accessToken,
      { name: 'Beta Desk' },
      key,
    ).expect(409);
    expect(conflict.body.error.code).toBe('IDEMPOTENCY_MISMATCH');
  });

  it('writes audit_logs and domain_events in the same transaction as org create', async () => {
    const { accessToken } = await register('audited@example.com');
    const created = await createOrg(accessToken, { name: 'Ledger' }).expect(201);

    const events = await prisma.domainEvent.findMany({
      where: { organizationId: created.body.id },
    });
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'organization.created',
          organizationId: created.body.id,
          status: 'PENDING',
        }),
      ]),
    );

    const audits = await prisma.auditLog.findMany({
      where: {
        organizationId: created.body.id,
        action: 'organization.create',
      },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.resourceType).toBe('organization');
    expect(audits[0]?.resourceId).toBe(created.body.id);
  });
});
