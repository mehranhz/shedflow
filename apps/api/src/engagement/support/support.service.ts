import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupportSenderType } from '@shedflow/db';
import { DOMAIN_EVENTS } from '@shedflow/shared';
import { randomUUID } from 'node:crypto';
import { Clock } from '../../common/clock/clock';
import { TransactionManager } from '../../common/persistence';
import { Outbox } from '../../domain-events/outbox';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { PortalCustomerContext } from '../portal-context';

const MAX_BODY = 4000;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 20;

@Injectable()
export class SupportService {
  private readonly recentByUser = new Map<string, number[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly transactions: TransactionManager,
    private readonly outbox: Outbox,
    private readonly notifications: NotificationsService,
  ) {}

  async listThreads(ctx: PortalCustomerContext) {
    return this.prisma.supportThread.findMany({
      where: {
        organizationId: ctx.organizationId,
        customerId: ctx.customerId,
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
  }

  async getThread(ctx: PortalCustomerContext, threadId: string) {
    const thread = await this.prisma.supportThread.findFirst({
      where: {
        id: threadId,
        organizationId: ctx.organizationId,
        customerId: ctx.customerId,
      },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!thread) {
      throw new NotFoundException('Not found');
    }
    return thread;
  }

  /** Staff CRM path — tenant scoped. */
  async getThreadStaff(organizationId: string, threadId: string) {
    const thread = await this.prisma.supportThread.findFirst({
      where: { id: threadId, organizationId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        customer: { select: { id: true, name: true, email: true } },
      },
    });
    if (!thread) {
      throw new NotFoundException('Not found');
    }
    return thread;
  }

  async openOrGet(
    ctx: PortalCustomerContext,
    input: { bookingId?: string | null; subject?: string },
  ) {
    if (input.bookingId) {
      const booking = await this.prisma.booking.findFirst({
        where: {
          id: input.bookingId,
          organizationId: ctx.organizationId,
          customerId: ctx.customerId,
        },
      });
      if (!booking) {
        throw new NotFoundException('Not found');
      }
      const existing = await this.prisma.supportThread.findFirst({
        where: {
          organizationId: ctx.organizationId,
          customerId: ctx.customerId,
          bookingId: input.bookingId,
        },
      });
      if (existing) {
        return existing;
      }
    }

    const now = this.clock.now();
    return this.prisma.supportThread.create({
      data: {
        id: randomUUID(),
        organizationId: ctx.organizationId,
        customerId: ctx.customerId,
        bookingId: input.bookingId ?? null,
        subject: input.subject?.trim() || 'Support',
        updatedAt: now,
      },
    });
  }

  async postCustomerMessage(
    ctx: PortalCustomerContext,
    threadId: string,
    body: string,
  ) {
    this.enforceRate(ctx.userId);
    const text = body?.trim() ?? '';
    if (!text || text.length > MAX_BODY) {
      throw new ForbiddenException({
        code: 'INVALID_MESSAGE',
        message: 'Message body required (max 4000 chars)',
      });
    }

    const thread = await this.prisma.supportThread.findFirst({
      where: {
        id: threadId,
        organizationId: ctx.organizationId,
        customerId: ctx.customerId,
      },
    });
    if (!thread) {
      throw new NotFoundException('Not found');
    }

    return this.writeMessage({
      thread,
      senderType: SupportSenderType.CUSTOMER,
      senderUserId: ctx.userId,
      body: text,
      notifyCustomerUserId: null,
      toStaff: true,
    });
  }

  async postStaffMessage(
    organizationId: string,
    staffUserId: string,
    threadId: string,
    body: string,
  ) {
    this.enforceRate(staffUserId);
    const text = body?.trim() ?? '';
    if (!text || text.length > MAX_BODY) {
      throw new ForbiddenException({
        code: 'INVALID_MESSAGE',
        message: 'Message body required (max 4000 chars)',
      });
    }

    const thread = await this.prisma.supportThread.findFirst({
      where: { id: threadId, organizationId },
      include: { customer: true },
    });
    if (!thread) {
      throw new NotFoundException('Not found');
    }

    return this.writeMessage({
      thread,
      senderType: SupportSenderType.STAFF,
      senderUserId: staffUserId,
      body: text,
      notifyCustomerUserId: thread.customer.userId,
      toStaff: false,
      customerEmail: thread.customer.email,
    });
  }

  private async writeMessage(input: {
    thread: { id: string; organizationId: string; customerId: string };
    senderType: SupportSenderType;
    senderUserId: string;
    body: string;
    notifyCustomerUserId: string | null;
    toStaff: boolean;
    customerEmail?: string;
  }) {
    const now = this.clock.now();
    return this.transactions.runInTransaction(async () => {
      const message = await this.prisma.supportMessage.create({
        data: {
          id: randomUUID(),
          threadId: input.thread.id,
          organizationId: input.thread.organizationId,
          senderType: input.senderType,
          senderUserId: input.senderUserId,
          body: input.body,
        },
      });
      await this.prisma.supportThread.update({
        where: { id: input.thread.id },
        data: { updatedAt: now },
      });

      if (input.notifyCustomerUserId) {
        await this.notifications.create({
          userId: input.notifyCustomerUserId,
          organizationId: input.thread.organizationId,
          type: 'support.message',
          title: 'New reply from the business',
          body: input.body.slice(0, 140),
          href: `/portal/messages/${input.thread.id}`,
        });
      }

      await this.outbox.emit(
        DOMAIN_EVENTS.SupportMessageCreated,
        {
          threadId: input.thread.id,
          messageId: message.id,
          organizationId: input.thread.organizationId,
          customerId: input.thread.customerId,
          senderType: input.senderType,
          bodyPreview: input.body.slice(0, 200),
          toStaff: input.toStaff,
          customerEmail: input.customerEmail ?? null,
        },
        input.thread.organizationId,
      );

      return message;
    });
  }

  private enforceRate(userId: string): void {
    const now = Date.now();
    const window = this.recentByUser.get(userId) ?? [];
    const recent = window.filter((t) => now - t < RATE_WINDOW_MS);
    if (recent.length >= RATE_LIMIT) {
      throw new ForbiddenException({
        code: 'RATE_LIMITED',
        message: 'Too many messages',
      });
    }
    recent.push(now);
    this.recentByUser.set(userId, recent);
  }
}
