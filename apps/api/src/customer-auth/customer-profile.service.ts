import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Prisma } from '@shedflow/db';
import { DOMAIN_EVENTS, isValidTimeZone } from '@shedflow/shared';
import { Clock } from '../common/clock/clock';
import { TransactionManager } from '../common/persistence';
import { Outbox } from '../domain-events/outbox';
import { PrismaService } from '../prisma/prisma.service';
import {
  generateUserToken,
  hashUserToken,
} from '../user-tokens/user-token.crypto';
import { syntheticEmailForPhone } from '../auth/auth.service';
import type { CustomerBusiness } from './customer-auth.service';

const EMAIL_CHANGE_TTL_MS = 24 * 60 * 60 * 1000;
const PROFILE_LOCALES = ['en', 'fa'] as const;
const E164 = /^\+[1-9]\d{7,14}$/;
const SIMPLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Verify-then-merge for a customer email change (T-055):
 * 1. `User.email` stays unchanged until an `email_change_tokens` row is consumed.
 * 2. Another User who already owns the new address blocks the change.
 * 3. After the token is valid, customers are re-linked per organization:
 *    - an unlinked customer with the new email and no customer for this user is claimed (`userId` set);
 *    - an unlinked customer in an organization this user already belongs to is merged:
 *      bookings and form rows move onto the user's customer, then the duplicate is deleted;
 *    - a customer owned by a different user is never taken;
 *    - this user's customers whose email is the old address (or empty) are updated to the new address.
 *      A different non-empty per-business email is left alone.
 */

export type CustomerBusinessProfile = {
  organizationId: string;
  organizationName: string;
  name: string;
  phone: string | null;
  updatedAt: Date;
};

export type PortalPreferences = {
  timezone: string;
  locale: string;
  reduceMotion: boolean;
  denseText: boolean;
  highContrast: 'system';
};

export type CustomerProfile = {
  user: {
    id: string;
    name: string | null;
    phone: string | null;
    photoUrl: string | null;
    timezone: string;
    locale: string;
    portal: PortalPreferences;
    updatedAt: Date;
  };
  businesses: CustomerBusiness[];
  activeCustomerOrgId: string | null;
  activeCustomerId: string | null;
  businessProfile: CustomerBusinessProfile | null;
};

type ProfilePatch = {
  name?: string;
  phone?: string | null;
  photoUrl?: string | null;
  timezone?: string;
  locale?: string;
  updatedAt: string;
  business?: {
    name?: string;
    phone?: string | null;
    updatedAt: string;
  };
  portal?: {
    reduceMotion?: boolean;
    denseText?: boolean;
    highContrast?: 'system';
  };
};

export function readPortalPreferences(
  settings: unknown,
  timezone: string,
  locale: string,
): PortalPreferences {
  const root =
    settings && typeof settings === 'object' && !Array.isArray(settings)
      ? (settings as Record<string, unknown>)
      : {};
  const portal =
    root.portal && typeof root.portal === 'object' && !Array.isArray(root.portal)
      ? (root.portal as Record<string, unknown>)
      : {};
  return {
    timezone,
    locale,
    reduceMotion: portal.reduceMotion === true,
    denseText: portal.denseText === true,
    highContrast: 'system',
  };
}

function settingsWithPortal(
  current: unknown,
  portal: PortalPreferences,
): Prisma.InputJsonValue {
  const base =
    current && typeof current === 'object' && !Array.isArray(current)
      ? { ...(current as Record<string, unknown>) }
      : {};
  return { ...base, portal } as Prisma.InputJsonValue;
}

function samePortal(left: PortalPreferences, right: PortalPreferences): boolean {
  return (
    left.timezone === right.timezone &&
    left.locale === right.locale &&
    left.reduceMotion === right.reduceMotion &&
    left.denseText === right.denseText &&
    left.highContrast === right.highContrast
  );
}

type LinkedCustomer = {
  id: string;
  organizationId: string;
  userId: string | null;
  email: string | null;
  name: string;
  phone: string | null;
  updatedAt: Date;
  organization: {
    id: string;
    slug: string;
    name: string;
    brandColor: string | null;
    logoUrl: string | null;
  };
  bookings: Array<{ startAt: Date }>;
};

@Injectable()
export class CustomerProfileService {
  private readonly logger = new Logger(CustomerProfileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly transactions: TransactionManager,
    private readonly outbox: Outbox,
    private readonly clock: Clock,
  ) {}

  async get(userId: string, organizationId?: string | null): Promise<CustomerProfile> {
    const user = await this.requireUser(userId);
    const customers = await this.linkedCustomers(userId);
    return this.toProfile(user, customers, organizationId);
  }

  async update(
    userId: string,
    organizationId: string | undefined,
    input: ProfilePatch,
    ifMatch?: string,
  ): Promise<CustomerProfile> {
    const user = await this.requireUser(userId);
    const patch = this.parsePatch(input);
    this.assertVersion(user.updatedAt, input.updatedAt, ifMatch, 'updatedAt');
    const customers = await this.linkedCustomers(userId);
    const active = this.pick(customers, organizationId);
    if (input.business && !active) {
      throw new BadRequestException({
        message: 'Validation failed',
        fieldErrors: { organizationId: ['Choose a business first'] },
      });
    }
    if (input.business && active) {
      this.assertVersion(
        active.updatedAt,
        input.business.updatedAt,
        undefined,
        'business.updatedAt',
      );
    }
    if (patch.phone) {
      const taken = await this.prisma.activeClient().user.findFirst({
        where: { phone: patch.phone, deletedAt: null, NOT: { id: userId } },
      });
      if (taken) {
        throw new ConflictException('Phone is already registered');
      }
    }

    const userData = this.userChanges(user, patch);
    const customerWrites = this.planCustomerWrites(user, customers, active, patch, input.business);
    if (Object.keys(userData).length === 0 && customerWrites.length === 0) {
      return this.toProfile(user, customers, organizationId);
    }

    await this.transactions.runInTransaction(async () => {
      const client = this.prisma.activeClient();
      if (Object.keys(userData).length > 0) {
        const updated = await client.user.updateMany({
          where: { id: user.id, updatedAt: user.updatedAt, deletedAt: null },
          data: userData,
        });
        if (updated.count !== 1) {
          throw this.conflict('updatedAt');
        }
      }
      for (const write of customerWrites) {
        const updated = await client.customer.updateMany({
          where: {
            id: write.id,
            organizationId: write.organizationId,
            userId,
            updatedAt: write.updatedAt,
          },
          data: write.data,
        });
        if (updated.count !== 1) {
          throw this.conflict(
            active && write.id === active.id ? 'business.updatedAt' : 'updatedAt',
          );
        }
      }
      await this.outbox.emit(
        DOMAIN_EVENTS.CustomerProfileUpdated,
        {
          userId,
          fields: [
            ...Object.keys(userData),
            ...(customerWrites.length > 0 ? ['business'] : []),
          ],
        },
        active?.organizationId ?? customerWrites[0]?.organizationId ?? null,
      );
    });

    return this.get(userId, organizationId);
  }

  async requestEmailChange(
    userId: string,
    input: { email: string; updatedAt: string },
    ifMatch?: string,
  ): Promise<{ accepted: true }> {
    const user = await this.requireUser(userId);
    this.assertVersion(user.updatedAt, input.updatedAt, ifMatch, 'updatedAt');
    const email = normalizeEmail(input.email);
    if (!SIMPLE_EMAIL.test(email)) {
      throw new BadRequestException({
        message: 'Validation failed',
        fieldErrors: { email: ['Invalid email'] },
      });
    }
    if (email === user.email) {
      throw new BadRequestException({
        message: 'Validation failed',
        fieldErrors: { email: ['That is already your email'] },
      });
    }
    const taken = await this.prisma.activeClient().user.findFirst({
      where: { email, deletedAt: null, NOT: { id: userId } },
    });
    if (taken) {
      throw new ConflictException('Email is already registered');
    }

    const raw = generateUserToken();
    const now = this.clock.now();
    await this.transactions.runInTransaction(async () => {
      const client = this.prisma.activeClient();
      const current = await client.user.findFirst({
        where: { id: user.id, updatedAt: user.updatedAt, deletedAt: null },
      });
      if (!current) {
        throw this.conflict('updatedAt');
      }
      await client.emailChangeToken.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: now },
      });
      await client.emailChangeToken.create({
        data: {
          userId,
          email,
          tokenHash: hashUserToken(raw),
          expiresAt: new Date(now.getTime() + EMAIL_CHANGE_TTL_MS),
        },
      });
      await this.outbox.emit(
        DOMAIN_EVENTS.CustomerEmailChangeRequested,
        { userId, email },
        null,
      );
    });
    this.logEmailChange(user.email, email, raw);
    return { accepted: true };
  }

  async confirmEmailChange(userId: string, rawToken: string): Promise<CustomerProfile> {
    const tokenHash = hashUserToken(rawToken.trim());
    const now = this.clock.now();
    await this.transactions.runInTransaction(async () => {
      const client = this.prisma.activeClient();
      const token = await client.emailChangeToken.findFirst({
        where: { tokenHash },
      });
      if (
        !token ||
        token.userId !== userId ||
        token.usedAt ||
        token.expiresAt.getTime() <= now.getTime()
      ) {
        throw new BadRequestException({ message: 'Invalid or expired token' });
      }
      const user = await client.user.findFirst({
        where: { id: userId, deletedAt: null },
      });
      if (!user) {
        throw new UnauthorizedException();
      }
      const newEmail = normalizeEmail(token.email);
      const oldEmail = normalizeEmail(user.email);
      const owner = await client.user.findFirst({
        where: { email: newEmail, deletedAt: null, NOT: { id: userId } },
      });
      if (owner) {
        throw new ConflictException('Email is already registered');
      }
      const newcomers = await client.customer.findMany({
        where: { email: { equals: newEmail, mode: 'insensitive' } },
      });
      if (newcomers.some((row) => row.userId && row.userId !== userId)) {
        throw new ConflictException('Email is already registered');
      }

      const consumed = await client.emailChangeToken.updateMany({
        where: { id: token.id, usedAt: null },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) {
        throw new BadRequestException({ message: 'Invalid or expired token' });
      }
      const renamed = await client.user.updateMany({
        where: { id: user.id, email: user.email, deletedAt: null },
        data: { email: newEmail, emailVerifiedAt: now },
      });
      if (renamed.count !== 1) {
        throw this.conflict('updatedAt');
      }

      const mine = await client.customer.findMany({ where: { userId } });
      for (const row of newcomers) {
        if (row.userId === userId) {
          continue;
        }
        const existing = mine.find((item) => item.organizationId === row.organizationId);
        if (!existing) {
          const linked = await client.customer.updateMany({
            where: {
              id: row.id,
              organizationId: row.organizationId,
              userId: null,
            },
            data: { userId },
          });
          if (linked.count !== 1) {
            throw new ConflictException('Email is already registered');
          }
          continue;
        }
        await client.booking.updateMany({
          where: { customerId: row.id, organizationId: row.organizationId },
          data: { customerId: existing.id },
        });
        await client.formAssignment.updateMany({
          where: { customerId: row.id, organizationId: row.organizationId },
          data: { customerId: existing.id },
        });
        await client.formSubmission.updateMany({
          where: { customerId: row.id, organizationId: row.organizationId },
          data: { customerId: existing.id },
        });
        await client.customer.deleteMany({
          where: {
            id: row.id,
            organizationId: row.organizationId,
            userId: null,
          },
        });
      }

      const linkedNow = await client.customer.findMany({ where: { userId } });
      for (const row of linkedNow) {
        const current = row.email ? normalizeEmail(row.email) : null;
        if (current === newEmail) {
          continue;
        }
        if (current !== null && current !== oldEmail) {
          continue;
        }
        await client.customer.updateMany({
          where: { id: row.id, organizationId: row.organizationId, userId },
          data: { email: newEmail },
        });
      }

      await this.outbox.emit(
        DOMAIN_EVENTS.CustomerEmailChanged,
        { userId, email: newEmail },
        null,
      );
    });
    return this.get(userId);
  }

  private async requireUser(userId: string) {
    const user = await this.prisma.activeClient().user.findFirst({
      where: { id: userId, deletedAt: null },
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }

  private linkedCustomers(userId: string): Promise<LinkedCustomer[]> {
    return this.prisma.activeClient().customer.findMany({
      where: { userId },
      include: {
        organization: true,
        bookings: {
          select: { startAt: true },
          orderBy: { startAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private toProfile(
    user: {
      id: string;
      email: string;
      name: string | null;
      phone: string | null;
      photoUrl: string | null;
      timezone: string;
      locale: string;
      settings?: unknown;
      updatedAt: Date;
    },
    customers: LinkedCustomer[],
    organizationId?: string | null,
  ): CustomerProfile {
    const businesses = customers.map((row) => ({
      organizationId: row.organizationId,
      slug: row.organization.slug,
      name: row.organization.name,
      customerId: row.id,
      brandColor: row.organization.brandColor,
      logoUrl: row.organization.logoUrl,
      lastBookingAt: row.bookings[0]?.startAt.toISOString() ?? null,
    }));
    const active = this.pick(customers, organizationId);
    return {
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        photoUrl: user.photoUrl,
        timezone: user.timezone,
        locale: user.locale,
        portal: readPortalPreferences(user.settings, user.timezone, user.locale),
        updatedAt: user.updatedAt,
      },
      businesses,
      activeCustomerOrgId: active?.organizationId ?? null,
      activeCustomerId: active?.id ?? null,
      businessProfile: active
        ? {
            organizationId: active.organizationId,
            organizationName: active.organization.name,
            name: active.name,
            phone: active.phone,
            updatedAt: active.updatedAt,
          }
        : null,
    };
  }

  private pick(
    customers: LinkedCustomer[],
    organizationId?: string | null,
  ): LinkedCustomer | null {
    if (!organizationId) {
      return null;
    }
    return customers.find((row) => row.organizationId === organizationId) ?? null;
  }

  private parsePatch(input: ProfilePatch): Omit<ProfilePatch, 'updatedAt' | 'business'> {
    const fieldErrors: Record<string, string[]> = {};
    const patch: Omit<ProfilePatch, 'updatedAt' | 'business'> = {};

    if (input.name !== undefined) {
      const name = input.name.trim().replace(/\s+/g, ' ');
      if (!name || name.length > 120) {
        fieldErrors.name = ['Name is required'];
      } else {
        patch.name = name;
      }
    }
    if (input.phone !== undefined) {
      const phone = normalizePhone(input.phone);
      if (phone === undefined) {
        fieldErrors.phone = ['Invalid phone number'];
      } else {
        patch.phone = phone;
      }
    }
    if (input.photoUrl !== undefined) {
      const photo = normalizePhoto(input.photoUrl);
      if (photo === undefined) {
        fieldErrors.photoUrl = ['Photo URL must be an http(s) link'];
      } else {
        patch.photoUrl = photo;
      }
    }
    if (input.timezone !== undefined) {
      const timezone = input.timezone.trim();
      if (!timezone || (timezone !== 'UTC' && !isValidTimeZone(timezone))) {
        fieldErrors.timezone = ['Invalid IANA timezone'];
      } else {
        patch.timezone = timezone;
      }
    }
    if (input.locale !== undefined) {
      const locale = input.locale.trim().toLowerCase();
      if (!(PROFILE_LOCALES as readonly string[]).includes(locale)) {
        fieldErrors.locale = ['Unsupported language'];
      } else {
        patch.locale = locale;
      }
    }
    if (input.portal) {
      if (
        input.portal.reduceMotion !== undefined &&
        typeof input.portal.reduceMotion !== 'boolean'
      ) {
        fieldErrors['portal.reduceMotion'] = ['Reduce motion must be true or false'];
      }
      if (input.portal.denseText !== undefined && typeof input.portal.denseText !== 'boolean') {
        fieldErrors['portal.denseText'] = ['Denser text must be true or false'];
      }
      if (input.portal.highContrast !== undefined && input.portal.highContrast !== 'system') {
        fieldErrors['portal.highContrast'] = ['High contrast follows the system'];
      }
      if (
        fieldErrors['portal.reduceMotion'] == null &&
        fieldErrors['portal.denseText'] == null &&
        fieldErrors['portal.highContrast'] == null
      ) {
        patch.portal = {
          reduceMotion: input.portal.reduceMotion,
          denseText: input.portal.denseText,
          highContrast: input.portal.highContrast,
        };
      }
    }
    if (input.business?.name !== undefined) {
      const name = input.business.name.trim().replace(/\s+/g, ' ');
      if (!name || name.length > 120) {
        fieldErrors['business.name'] = ['Name is required'];
      }
    }
    if (input.business?.phone !== undefined) {
      const phone = normalizePhone(input.business.phone);
      if (phone === undefined) {
        fieldErrors['business.phone'] = ['Invalid phone number'];
      }
    }
    if (!input.updatedAt?.trim() || instantOf(input.updatedAt) == null) {
      fieldErrors.updatedAt = ['Invalid updatedAt'];
    }
    if (
      input.business &&
      (!input.business.updatedAt?.trim() || instantOf(input.business.updatedAt) == null)
    ) {
      fieldErrors['business.updatedAt'] = ['Invalid updatedAt'];
    }

    if (Object.keys(fieldErrors).length > 0) {
      throw new BadRequestException({
        message: 'Validation failed',
        fieldErrors,
      });
    }
    return patch;
  }

  private userChanges(
    user: {
      name: string | null;
      phone: string | null;
      photoUrl: string | null;
      timezone: string;
      locale: string;
      settings?: unknown;
    },
    patch: Omit<ProfilePatch, 'updatedAt' | 'business'>,
  ): {
    name?: string;
    phone?: string | null;
    phoneVerifiedAt?: null;
    email?: string;
    photoUrl?: string | null;
    timezone?: string;
    locale?: string;
    settings?: Prisma.InputJsonValue;
  } {
    const data: {
      name?: string;
      phone?: string | null;
      phoneVerifiedAt?: null;
      email?: string;
      photoUrl?: string | null;
      timezone?: string;
      locale?: string;
      settings?: Prisma.InputJsonValue;
    } = {};
    if (patch.name !== undefined && patch.name !== (user.name ?? '')) {
      data.name = patch.name;
    }
    if (patch.phone !== undefined && patch.phone !== user.phone) {
      data.phone = patch.phone;
      data.phoneVerifiedAt = null;
      if (patch.phone) {
        data.email = syntheticEmailForPhone(patch.phone);
      }
    }
    if (patch.photoUrl !== undefined && patch.photoUrl !== user.photoUrl) {
      data.photoUrl = patch.photoUrl;
    }
    if (patch.timezone !== undefined && patch.timezone !== user.timezone) {
      data.timezone = patch.timezone;
    }
    if (patch.locale !== undefined && patch.locale !== user.locale) {
      data.locale = patch.locale;
    }
    const currentPortal = readPortalPreferences(user.settings, user.timezone, user.locale);
    const nextPortal: PortalPreferences = {
      timezone: patch.timezone ?? user.timezone,
      locale: patch.locale ?? user.locale,
      reduceMotion: patch.portal?.reduceMotion ?? currentPortal.reduceMotion,
      denseText: patch.portal?.denseText ?? currentPortal.denseText,
      highContrast: 'system',
    };
    const portalTouched =
      patch.portal !== undefined || patch.timezone !== undefined || patch.locale !== undefined;
    if (portalTouched && !samePortal(currentPortal, nextPortal)) {
      data.settings = settingsWithPortal(user.settings, nextPortal);
    }
    return data;
  }

  /**
   * Account name/phone follow onto customer rows that still match the previous
   * account values. An explicit business block wins for the active organization,
   * which is the name future bookings copy as the invitee.
   */
  private planCustomerWrites(
    user: { name: string | null; phone: string | null },
    customers: LinkedCustomer[],
    active: LinkedCustomer | null,
    patch: Omit<ProfilePatch, 'updatedAt' | 'business'>,
    business: ProfilePatch['business'],
  ): Array<{
    id: string;
    organizationId: string;
    updatedAt: Date;
    data: { name?: string; phone?: string | null };
  }> {
    const nameChanged = patch.name !== undefined && patch.name !== (user.name ?? '');
    const phoneChanged = patch.phone !== undefined && patch.phone !== user.phone;
    const writes: Array<{
      id: string;
      organizationId: string;
      updatedAt: Date;
      data: { name?: string; phone?: string | null };
    }> = [];

    for (const row of customers) {
      const data: { name?: string; phone?: string | null } = {};
      if (nameChanged && row.name === (user.name ?? '')) {
        data.name = patch.name;
      }
      if (phoneChanged && row.phone === user.phone) {
        data.phone = patch.phone ?? null;
      }
      if (active && row.id === active.id && business) {
        if (business.name !== undefined) {
          const name = business.name.trim().replace(/\s+/g, ' ');
          if (name !== (data.name ?? row.name)) {
            data.name = name;
          }
        }
        if (business.phone !== undefined) {
          const phone = normalizePhone(business.phone);
          const next = phone === undefined ? row.phone : phone;
          if (next !== (data.phone !== undefined ? data.phone : row.phone)) {
            data.phone = next;
          }
        }
      }
      if (Object.keys(data).length > 0) {
        writes.push({
          id: row.id,
          organizationId: row.organizationId,
          updatedAt: row.updatedAt,
          data,
        });
      }
    }
    return writes;
  }

  private assertVersion(
    current: Date,
    presented: string | undefined,
    ifMatch: string | undefined,
    field: string,
  ): void {
    const currentMs = current.getTime();
    const presentedMs = presented ? instantOf(presented) : null;
    if (presentedMs == null || presentedMs !== currentMs) {
      throw this.conflict(field);
    }
    if (ifMatch !== undefined && ifMatch.trim() !== '') {
      const matchMs = instantOf(ifMatch);
      if (matchMs == null || matchMs !== currentMs) {
        throw this.conflict(field);
      }
    }
  }

  private conflict(field: string): ConflictException {
    return new ConflictException({
      code: 'CONFLICT',
      message: 'Profile was updated. Refresh and try again.',
      fieldErrors: { [field]: ['Profile was updated. Refresh and try again.'] },
    });
  }

  private logEmailChange(currentEmail: string, nextEmail: string, raw: string): void {
    const appUrl = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
    const link = `${appUrl}/portal/account/profile?emailToken=${raw}`;
    this.logger.log(`customer email change ${currentEmail} -> ${nextEmail} ${link}`);
    void this.writeDevLine(currentEmail, nextEmail, raw);
  }

  /** Same local file as OTP codes so a developer can confirm an email change without inbox access. */
  private async writeDevLine(
    currentEmail: string,
    nextEmail: string,
    raw: string,
  ): Promise<void> {
    if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test') {
      return;
    }
    const path = process.env.DEV_OTP_LOG_PATH?.trim() || '/app/logs/dev-otp.log';
    const line = [
      new Date().toISOString(),
      'event=email_change',
      `username=${oneLine(currentEmail)}`,
      `email=${oneLine(nextEmail)}`,
      `token=${oneLine(raw)}`,
    ].join(' ');
    try {
      await mkdir(dirname(path), { recursive: true });
      await appendFile(path, `${line}\n`, 'utf8');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Dev OTP log write failed: ${message}`);
    }
  }
}

export function profileEtag(updatedAt: Date | string): string {
  const iso = updatedAt instanceof Date ? updatedAt.toISOString() : new Date(updatedAt).toISOString();
  return `W/"${iso}"`;
}

function instantOf(value: string): number | null {
  const trimmed = value.trim().replace(/^W\//i, '').replace(/^"/, '').replace(/"$/, '');
  const ms = Date.parse(trimmed);
  return Number.isNaN(ms) ? null : ms;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** `null` clears the phone. `undefined` means the value is not a valid E.164 number. */
function normalizePhone(value: string | null): string | null | undefined {
  if (value == null) {
    return null;
  }
  const compact = value.trim().replace(/[\s()-]/g, '');
  if (!compact) {
    return null;
  }
  if (!E164.test(compact)) {
    return undefined;
  }
  return compact;
}

/** `null` clears the photo. `undefined` means the value is not an http(s) URL. */
function normalizePhoto(value: string | null): string | null | undefined {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > 2048) {
    return undefined;
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return undefined;
    }
    return trimmed;
  } catch {
    return undefined;
  }
}

function oneLine(value: string): string {
  return value.replace(/[\r\n]/g, '');
}
