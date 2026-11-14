import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { BookingsService } from '../bookings/bookings.service';

@Injectable()
export class MeBookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly bookings: BookingsService,
  ) {}

  async list(userId: string) {
    const ids = await this.customerIds(userId);
    const rows = await this.prisma.booking.findMany({
      where: { customerId: { in: ids } },
      include: { eventType: true, organization: true },
      orderBy: { startAt: 'desc' },
    });
    const items = rows.map((row) => ({
      id: row.id,
      uid: row.uid,
      organizationId: row.organizationId,
      status: row.status,
      startAt: row.startAt,
      endAt: row.endAt,
      timezone: row.timezone,
      eventType: { title: row.eventType.title },
      organization: {
        id: row.organization.id,
        name: row.organization.name,
        slug: row.organization.slug,
      },
    }));
    return { items, total: items.length, page: 1, limit: Math.max(items.length, 1), pageCount: 1 };
  }

  async cancel(userId: string, bookingId: string, reason?: string) {
    const ids = await this.customerIds(userId);
    return this.bookings.cancelIfCustomer(bookingId, ids, reason);
  }

  private async customerIds(userId: string): Promise<string[]> {
    const user = await this.users.findById(userId);
    const rows = await this.prisma.customer.findMany({
      where: {
        OR: [
          { userId },
          ...(user?.phone ? [{ phone: user.phone }] : []),
        ],
      },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }
}
