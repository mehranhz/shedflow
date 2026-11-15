import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  BookingStatus,
  FormAssignmentStatus,
  Prisma,
  WaitlistStatus,
} from '@shedflow/db';
import {
  DOMAIN_EVENTS,
  FEATURE_FLAGS,
  isEnabled,
  type BookingAnswers,
} from '@shedflow/shared';
import type { BookingEntity } from '../bookings/booking';
import { BookingsService } from '../bookings/bookings.service';
import { TransactionManager } from '../common/persistence';
import { Outbox } from '../domain-events/outbox';
import { PrismaService } from '../prisma/prisma.service';
import {
  CUSTOMER_ATTACHMENT_MAX_COUNT,
  customerNoteEditable,
  evaluateCustomerPolicy,
  validateAttachmentLink,
  virusScanHook,
  type CustomerPolicyView,
} from './customer-booking-view';

const UPCOMING_STATUSES: BookingStatus[] = [
  BookingStatus.CONFIRMED,
  BookingStatus.PENDING_CONFIRMATION,
  BookingStatus.PENDING_PAYMENT,
];

type OwnedBooking = Prisma.BookingGetPayload<{
  include: {
    eventType: true;
    organization: true;
    host: { select: { id: true; name: true } };
    paymentReceipts: true;
    formAssignments: true;
  };
}>;

@Injectable()
export class CustomerBookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
    private readonly transactions: TransactionManager,
    private readonly outbox: Outbox,
  ) {}

  async home(userId: string, organizationId?: string) {
    const customers = await this.linkedCustomers(userId, organizationId);
    if (customers.length === 0) {
      return emptyHome();
    }
    const ids = customers.map((row) => row.id);
    const now = new Date();
    const org = customers[0]?.organization;
    const [upcoming, attention, receiptRows, waitlistCount] = await Promise.all([
      this.prisma.booking.findMany({
        where: {
          customerId: { in: ids },
          startAt: { gte: now },
          status: { in: UPCOMING_STATUSES },
        },
        include: bookingInclude,
        orderBy: { startAt: 'asc' },
        take: 8,
      }),
      this.prisma.booking.findMany({
        where: {
          customerId: { in: ids },
          OR: [
            { status: { in: [BookingStatus.PENDING_CONFIRMATION, BookingStatus.PENDING_PAYMENT] } },
            {
              formAssignments: {
                some: { status: FormAssignmentStatus.PENDING, requiredBeforeConfirm: true },
              },
            },
          ],
        },
        include: bookingInclude,
        orderBy: { startAt: 'asc' },
        take: 12,
      }),
      this.prisma.booking.findMany({
        where: {
          customerId: { in: ids },
          OR: [
            {
              status: BookingStatus.PENDING_PAYMENT,
              eventType: { requiresPaymentReceipt: true },
            },
            { paymentReceipts: { some: { status: 'UPLOADED' } } },
          ],
        },
        select: { id: true },
      }),
      this.prisma.waitlistEntry.count({
        where: {
          customerId: { in: ids },
          status: { in: [WaitlistStatus.WAITING, WaitlistStatus.OFFERED] },
        },
      }),
    ]);

    return {
      nextAppointment: upcoming[0] ? this.toCard(upcoming[0]) : null,
      actionsNeeded: attention.map((row) => this.toCard(row)),
      receiptsPendingCount: receiptRows.length,
      waitlistCount,
      bookHref: org ? '/portal/book' : null,
      organization: org
        ? { id: org.id, slug: org.slug, name: org.name }
        : null,
      features: {
        customerRecurring: isEnabled(FEATURE_FLAGS.customerRecurring, {
          settings: org?.settings,
        }),
      },
    };
  }

  async list(
    userId: string,
    organizationId?: string,
    query?: { status?: string; tab?: string; q?: string; upcoming?: string },
  ) {
    const customers = await this.linkedCustomers(userId, organizationId);
    if (organizationId && customers.length === 0) {
      throw new NotFoundException('Customer link not found');
    }
    const ids = customers.map((row) => row.id);
    if (ids.length === 0) {
      return { items: [], total: 0, page: 1, limit: 1, pageCount: 1 };
    }
    const now = new Date();
    const where = this.listWhere(ids, now, query);
    const rows = await this.prisma.booking.findMany({
      where,
      include: bookingInclude,
      orderBy: { startAt: query?.tab === 'past' || query?.tab === 'cancelled' ? 'desc' : 'asc' },
    });
    const items = rows.map((row) => this.toCard(row));
    return {
      items,
      total: items.length,
      page: 1,
      limit: Math.max(items.length, 1),
      pageCount: 1,
    };
  }

  async detail(userId: string, organizationId: string | undefined, uid: string) {
    const row = await this.requireOwned(userId, organizationId, uid);
    return this.toDetail(row);
  }

  async create(
    userId: string,
    organizationId: string | undefined,
    input: {
      eventTypeSlug: string;
      startAt: string;
      timezone: string;
      answers?: BookingAnswers;
      occurrences?: number;
    },
  ) {
    if (!organizationId) {
      throw new BadRequestException({
        fieldErrors: { organizationId: ['Choose a business first'] },
      });
    }
    const customers = await this.linkedCustomers(userId, organizationId);
    const customer = customers[0];
    if (!customer) {
      throw new NotFoundException('Customer link not found');
    }
    const occurrences = input.occurrences ?? 1;
    if (
      occurrences > 1 &&
      !isEnabled(FEATURE_FLAGS.customerRecurring, { settings: customer.organization.settings })
    ) {
      throw new ForbiddenException({
        code: 'FEATURE_GATED',
        message: 'Recurring booking is not enabled',
      });
    }
    const startAt = new Date(input.startAt);
    if (Number.isNaN(startAt.getTime())) {
      throw new BadRequestException({ fieldErrors: { startAt: ['Invalid startAt'] } });
    }
    const created = await this.bookings.createForLinkedCustomer({
      organizationId,
      customerId: customer.id,
      eventTypeSlug: input.eventTypeSlug,
      startAt,
      timezone: input.timezone,
      answers: input.answers,
      occurrences,
    });
    const first = created[0];
    if (!first) {
      throw new NotFoundException('Not found');
    }
    const detail = await this.detail(userId, organizationId, first.uid);
    return {
      ...detail,
      series: first.seriesId
        ? { id: first.seriesId, uids: created.map((row) => row.uid) }
        : null,
    };
  }

  async cancel(
    userId: string,
    organizationId: string | undefined,
    uid: string,
    reason?: string,
    scope?: 'single' | 'this_and_future',
  ) {
    const row = await this.requireOwned(userId, organizationId, uid);
    const ids = [row.customerId];
    if (scope === 'this_and_future' && row.seriesId) {
      const siblings = await this.prisma.booking.findMany({
        where: {
          seriesId: row.seriesId,
          customerId: row.customerId,
          startAt: { gte: row.startAt },
          status: { in: UPCOMING_STATUSES },
        },
        orderBy: { startAt: 'asc' },
      });
      const cancelled: BookingEntity[] = [];
      for (const sibling of siblings) {
        cancelled.push(
          await this.bookings.cancelForLinkedCustomer(sibling.uid, ids, reason),
        );
      }
      return { items: cancelled.map((item) => ({ uid: item.uid, status: item.status })) };
    }
    const updated = await this.bookings.cancelForLinkedCustomer(uid, ids, reason);
    return this.detail(userId, organizationId, updated.uid);
  }

  async reschedule(
    userId: string,
    organizationId: string | undefined,
    uid: string,
    startAtRaw: string,
    timezone: string,
  ) {
    const row = await this.requireOwned(userId, organizationId, uid);
    const startAt = new Date(startAtRaw);
    if (Number.isNaN(startAt.getTime())) {
      throw new BadRequestException({ fieldErrors: { startAt: ['Invalid startAt'] } });
    }
    const updated = await this.bookings.rescheduleForLinkedCustomer(
      uid,
      [row.customerId],
      startAt,
      timezone,
    );
    return this.detail(userId, organizationId, updated.uid);
  }

  async updateNote(
    userId: string,
    organizationId: string | undefined,
    uid: string,
    customerNote: string,
  ) {
    const row = await this.requireOwned(userId, organizationId, uid);
    if (!customerNoteEditable(row.startAt, new Date(), row.status)) {
      throw new UnprocessableEntityException({
        code: 'NOTE_LOCKED',
        message: 'Notes are locked after the appointment starts',
      });
    }
    const metadata = {
      ...asObject(row.metadata),
      customerNote,
    };
    await this.writeMetadata(row, metadata, 'note');
    return this.detail(userId, organizationId, uid);
  }

  async addAttachment(
    userId: string,
    organizationId: string | undefined,
    uid: string,
    input: { url: string; name: string; mimeType: string; sizeBytes: number },
  ) {
    const row = await this.requireOwned(userId, organizationId, uid);
    const verdict = validateAttachmentLink(input);
    if (!verdict.ok) {
      throw new BadRequestException({
        fieldErrors: { [verdict.field]: [verdict.message] },
      });
    }
    virusScanHook(input.url);
    const current = readAttachments(row.metadata);
    if (current.length >= CUSTOMER_ATTACHMENT_MAX_COUNT) {
      throw new BadRequestException({
        fieldErrors: { url: ['This appointment already has the maximum number of links'] },
      });
    }
    const metadata = {
      ...asObject(row.metadata),
      customerAttachments: [
        ...current,
        {
          url: input.url,
          name: input.name.trim(),
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          addedAt: new Date().toISOString(),
        },
      ],
    };
    await this.writeMetadata(row, metadata, 'attachment');
    return this.detail(userId, organizationId, uid);
  }

  private async writeMetadata(
    row: OwnedBooking,
    metadata: Record<string, unknown>,
    kind: 'note' | 'attachment',
  ) {
    await this.transactions.runInTransaction(async () => {
      await this.prisma.booking.update({
        where: { id: row.id },
        data: { metadata: metadata as Prisma.InputJsonValue },
      });
      await this.outbox.emit(
        DOMAIN_EVENTS.BookingCustomerNoteUpdated,
        { bookingId: row.id, uid: row.uid, kind },
        row.organizationId,
      );
    });
  }

  private async linkedCustomers(userId: string, organizationId?: string) {
    const rows = await this.prisma.customer.findMany({
      where: {
        userId,
        ...(organizationId ? { organizationId } : {}),
      },
      include: {
        organization: {
          select: { id: true, slug: true, name: true, settings: true },
        },
      },
    });
    if (organizationId && rows.length === 0) {
      throw new NotFoundException('Customer link not found');
    }
    return rows;
  }

  private async requireOwned(
    userId: string,
    organizationId: string | undefined,
    uid: string,
  ): Promise<OwnedBooking> {
    const customers = await this.linkedCustomers(userId, organizationId);
    const row = await this.prisma.booking.findFirst({
      where: {
        uid,
        customerId: { in: customers.map((item) => item.id) },
        ...(organizationId ? { organizationId } : {}),
      },
      include: bookingInclude,
    });
    if (!row) {
      throw new NotFoundException('Not found');
    }
    return row;
  }

  private listWhere(
    customerIds: string[],
    now: Date,
    query?: { status?: string; tab?: string; q?: string; upcoming?: string },
  ): Prisma.BookingWhereInput {
    const where: Prisma.BookingWhereInput = { customerId: { in: customerIds } };
    if (query?.tab === 'upcoming' || query?.upcoming === '1') {
      where.startAt = { gte: now };
      where.status = { in: UPCOMING_STATUSES };
    } else if (query?.tab === 'past') {
      where.OR = [
        {
          startAt: { lt: now },
          status: { notIn: [BookingStatus.CANCELLED, BookingStatus.RESCHEDULED] },
        },
        { status: BookingStatus.NO_SHOW },
      ];
    } else if (query?.tab === 'cancelled') {
      where.status = { in: [BookingStatus.CANCELLED, BookingStatus.RESCHEDULED] };
    } else if (isBookingStatus(query?.status)) {
      where.status = query.status;
    }
    const q = query?.q?.trim();
    if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) {
      const from = new Date(`${q}T00:00:00.000Z`);
      where.startAt = { gte: from, lt: new Date(from.getTime() + 86_400_000) };
    } else if (q) {
      where.eventType = { title: { contains: q, mode: 'insensitive' } };
    }
    return where;
  }

  private toCard(row: OwnedBooking) {
    const receipt = latestReceipt(row);
    return {
      id: row.id,
      uid: row.uid,
      organizationId: row.organizationId,
      organizationSlug: row.organization.slug,
      organizationName: row.organization.name,
      brandColor: row.organization.brandColor,
      status: row.status,
      startAt: row.startAt,
      endAt: row.endAt,
      timezone: row.timezone,
      title: row.eventType.title,
      eventTypeTitle: row.eventType.title,
      eventType: { title: row.eventType.title, slug: row.eventType.slug },
      organization: {
        id: row.organization.id,
        slug: row.organization.slug,
        name: row.organization.name,
        brandColor: row.organization.brandColor,
      },
      locationType: row.locationType,
      locationValue: row.locationValue,
      receiptStatus: receipt?.status ?? null,
      seriesId: row.seriesId,
      hostName: row.host.name,
      durationMinutes: row.eventType.durationMinutes,
      description: row.eventType.description,
      requiresConfirmation: row.eventType.requiresConfirmation,
    };
  }

  private toDetail(row: OwnedBooking) {
    const policy: CustomerPolicyView = evaluateCustomerPolicy({
      now: new Date(),
      startAt: row.startAt,
      status: row.status,
      cancellationNoticeHours: row.eventType.cancellationNoticeHours,
      rescheduleNoticeHours: row.eventType.rescheduleNoticeHours,
    });
    const receipt = latestReceipt(row);
    return {
      ...this.toCard(row),
      answers: asObject(row.answers),
      cancellationReason: row.cancellationReason,
      paymentInstructions: row.eventType.paymentInstructions,
      requiresPaymentReceipt: row.eventType.requiresPaymentReceipt,
      customerNote: readNote(row.metadata),
      customerNoteEditable: customerNoteEditable(row.startAt, new Date(), row.status),
      attachments: readAttachments(row.metadata),
      incompleteForms: row.formAssignments.filter(
        (item) => item.status === FormAssignmentStatus.PENDING,
      ).length,
      policy,
      receipt: receipt
        ? {
            status: receipt.status,
            rejectionReason: receipt.rejectionReason,
            createdAt: receipt.createdAt,
          }
        : null,
    };
  }
}

const bookingInclude = {
  eventType: true,
  organization: true,
  host: { select: { id: true, name: true } },
  paymentReceipts: { orderBy: { createdAt: 'desc' as const }, take: 1 },
  formAssignments: true,
} satisfies Prisma.BookingInclude;

function emptyHome() {
  return {
    nextAppointment: null,
    actionsNeeded: [],
    receiptsPendingCount: 0,
    waitlistCount: 0,
    bookHref: null,
    organization: null,
    features: { customerRecurring: false },
  };
}

function latestReceipt(row: OwnedBooking) {
  return row.paymentReceipts[0] ?? null;
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function readNote(metadata: unknown): string {
  const note = asObject(metadata).customerNote;
  return typeof note === 'string' ? note : '';
}

function readAttachments(metadata: unknown): Array<{
  url: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  addedAt?: string;
}> {
  const raw = asObject(metadata).customerAttachments;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return [];
    }
    const row = item as Record<string, unknown>;
    if (typeof row.url !== 'string' || typeof row.name !== 'string') {
      return [];
    }
    return [
      {
        url: row.url,
        name: row.name,
        mimeType: typeof row.mimeType === 'string' ? row.mimeType : 'application/octet-stream',
        sizeBytes: typeof row.sizeBytes === 'number' ? row.sizeBytes : 0,
        addedAt: typeof row.addedAt === 'string' ? row.addedAt : undefined,
      },
    ];
  });
}

function isBookingStatus(value: string | undefined): value is BookingStatus {
  return (
    value === 'PENDING_PAYMENT' ||
    value === 'PENDING_CONFIRMATION' ||
    value === 'CONFIRMED' ||
    value === 'CANCELLED' ||
    value === 'RESCHEDULED' ||
    value === 'EXPIRED' ||
    value === 'NO_SHOW'
  );
}
