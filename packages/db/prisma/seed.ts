/**
 * Local / e2e demo seed (`docs/design/mvp/02-data-model.md` §9).
 *
 *   pnpm db:migrate
 *   pnpm --filter @shedflow/db seed
 *
 * Idempotent: re-running updates the demo org rather than duplicating.
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';
import * as bcrypt from 'bcrypt';
import {
  LocationType,
  MembershipStatus,
  PlatformPlan,
  ProductType,
  Role,
  createPrismaClient,
} from '../src/index.js';

config({ path: resolve(__dirname, '../../../.env') });
config({ path: resolve(__dirname, '../.env') });

const DEMO_EMAIL = 'owner@shedflow.dev';
const DEMO_PASSWORD = 'Password123!';
const DEMO_ORG_SLUG = 'acme';

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to seed');
  }

  const prisma = createPrismaClient(databaseUrl);
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    create: {
      email: DEMO_EMAIL,
      passwordHash,
      name: 'Acme Owner',
      timezone: 'America/New_York',
      locale: 'en',
      emailVerifiedAt: new Date(),
    },
    update: {
      passwordHash,
      name: 'Acme Owner',
      timezone: 'America/New_York',
      deletedAt: null,
    },
  });

  const organization = await prisma.organization.upsert({
    where: { slug: DEMO_ORG_SLUG },
    create: {
      name: 'Acme',
      slug: DEMO_ORG_SLUG,
      timezone: 'America/New_York',
      locale: 'en',
      currency: 'USD',
      platformPlan: PlatformPlan.PRO,
      brandColor: '#0069ff',
    },
    update: {
      name: 'Acme',
      timezone: 'America/New_York',
      currency: 'USD',
      platformPlan: PlatformPlan.PRO,
      deletedAt: null,
    },
  });

  await prisma.membership.upsert({
    where: {
      organizationId_userId: {
        organizationId: organization.id,
        userId: user.id,
      },
    },
    create: {
      organizationId: organization.id,
      userId: user.id,
      role: Role.OWNER,
      status: MembershipStatus.ACTIVE,
    },
    update: {
      role: Role.OWNER,
      status: MembershipStatus.ACTIVE,
    },
  });

  let schedule = await prisma.schedule.findFirst({
    where: {
      organizationId: organization.id,
      hostUserId: user.id,
      isDefault: true,
    },
  });
  if (!schedule) {
    schedule = await prisma.schedule.create({
      data: {
        organizationId: organization.id,
        hostUserId: user.id,
        name: 'Default',
        timezone: 'America/New_York',
        isDefault: true,
      },
    });
  } else {
    schedule = await prisma.schedule.update({
      where: { id: schedule.id },
      data: { timezone: 'America/New_York', name: 'Default' },
    });
  }

  await prisma.availabilityRule.deleteMany({ where: { scheduleId: schedule.id } });
  // Mon–Fri 09:00–17:00 (dayOfWeek 1–5, minutes from midnight).
  await prisma.availabilityRule.createMany({
    data: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
      scheduleId: schedule.id,
      dayOfWeek,
      startMinute: 9 * 60,
      endMinute: 17 * 60,
    })),
  });

  // Placeholder Stripe ids — not real Dashboard objects (tests mock Stripe).
  const product = await prisma.product.upsert({
    where: { stripeProductId: 'prod_seed_coaching' },
    create: {
      organizationId: organization.id,
      name: 'Coaching session',
      type: ProductType.ONE_TIME,
      stripeProductId: 'prod_seed_coaching',
      isActive: true,
    },
    update: {
      organizationId: organization.id,
      name: 'Coaching session',
      isActive: true,
    },
  });

  const price = await prisma.price.upsert({
    where: { stripePriceId: 'price_seed_coaching_150' },
    create: {
      productId: product.id,
      organizationId: organization.id,
      amountMinor: 15_000,
      currency: 'USD',
      interval: null,
      stripePriceId: 'price_seed_coaching_150',
      isActive: true,
    },
    update: {
      productId: product.id,
      organizationId: organization.id,
      amountMinor: 15_000,
      currency: 'USD',
      isActive: true,
    },
  });

  await prisma.eventType.upsert({
    where: {
      organizationId_slug: {
        organizationId: organization.id,
        slug: 'intro',
      },
    },
    create: {
      organizationId: organization.id,
      hostUserId: user.id,
      scheduleId: schedule.id,
      slug: 'intro',
      title: 'Intro call',
      description: '30-minute intro (free).',
      durationMinutes: 30,
      locationType: LocationType.GOOGLE_MEET,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      isActive: true,
      isHidden: false,
    },
    update: {
      hostUserId: user.id,
      scheduleId: schedule.id,
      title: 'Intro call',
      durationMinutes: 30,
      priceId: null,
      isActive: true,
    },
  });

  await prisma.eventType.upsert({
    where: {
      organizationId_slug: {
        organizationId: organization.id,
        slug: 'coaching',
      },
    },
    create: {
      organizationId: organization.id,
      hostUserId: user.id,
      scheduleId: schedule.id,
      slug: 'coaching',
      title: 'Coaching',
      description: '60-minute coaching ($150 one-time; seed price placeholder).',
      durationMinutes: 60,
      locationType: LocationType.GOOGLE_MEET,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      priceId: price.id,
      isActive: true,
      isHidden: false,
    },
    update: {
      hostUserId: user.id,
      scheduleId: schedule.id,
      title: 'Coaching',
      durationMinutes: 60,
      priceId: price.id,
      isActive: true,
    },
  });

  // eslint-disable-next-line no-console
  console.log(
    [
      'Seed OK',
      `  user: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`,
      `  org:  /${DEMO_ORG_SLUG}`,
      `  events: intro (free), coaching ($150 seed price)`,
    ].join('\n'),
  );

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});
