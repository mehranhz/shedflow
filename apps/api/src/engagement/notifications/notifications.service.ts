import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Page, buildPage, resolvePageRequest } from '../../common/persistence';
import { PrismaService } from '../../prisma/prisma.service';

export type UserNotificationView = {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string | null;
  organizationId: string | null;
  readAt: Date | null;
  createdAt: Date;
};

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: {
    userId: string;
    organizationId?: string | null;
    type: string;
    title: string;
    body?: string;
    href?: string | null;
  }): Promise<UserNotificationView> {
    const row = await this.prisma.userNotification.create({
      data: {
        id: randomUUID(),
        userId: input.userId,
        organizationId: input.organizationId ?? null,
        type: input.type,
        title: input.title,
        body: input.body ?? '',
        href: input.href ?? null,
      },
    });
    return this.toView(row);
  }

  async list(
    userId: string,
    request: { page?: number; limit?: number } = {},
  ): Promise<Page<UserNotificationView> & { unreadCount: number }> {
    const { page, limit, skip } = resolvePageRequest(request);
    const where = { userId };
    const [rows, total, unreadCount] = await Promise.all([
      this.prisma.userNotification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.userNotification.count({ where }),
      this.prisma.userNotification.count({
        where: { userId, readAt: null },
      }),
    ]);
    return {
      ...buildPage(
        rows.map((r) => this.toView(r)),
        total,
        page,
        limit,
      ),
      unreadCount,
    };
  }

  /** Idempotent mark-read. */
  async markRead(userId: string, id: string): Promise<UserNotificationView | null> {
    const row = await this.prisma.userNotification.findFirst({
      where: { id, userId },
    });
    if (!row) {
      return null;
    }
    if (row.readAt) {
      return this.toView(row);
    }
    const updated = await this.prisma.userNotification.update({
      where: { id },
      data: { readAt: new Date() },
    });
    return this.toView(updated);
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.prisma.userNotification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  private toView(row: {
    id: string;
    type: string;
    title: string;
    body: string;
    href: string | null;
    organizationId: string | null;
    readAt: Date | null;
    createdAt: Date;
  }): UserNotificationView {
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      body: row.body,
      href: row.href,
      organizationId: row.organizationId,
      readAt: row.readAt,
      createdAt: row.createdAt,
    };
  }
}
