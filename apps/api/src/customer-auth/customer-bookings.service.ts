import { Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus } from '@shedflow/db';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CustomerBookingsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    userId: string,
    organizationId?: string,
    status?: string,
  ) {
    const customers = await this.prisma.customer.findMany({
      where: {
        userId,
        ...(organizationId ? { organizationId } : {}),
      },
      select: { id: true },
    });
    if (organizationId && customers.length === 0) {
      throw new NotFoundException('Customer link not found');
    }
    const statusFilter = isBookingStatus(status) ? status : undefined;
    const rows = await this.prisma.booking.findMany({
      where: {
        customerId: { in: customers.map((row) => row.id) },
        ...(statusFilter ? { status: statusFilter } : {}),
      },
      include: { eventType: true, organization: true },
      orderBy: { startAt: 'asc' },
    });
    const items = rows.map((row) => ({
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
    }));
    return {
      items,
      total: items.length,
      page: 1,
      limit: Math.max(items.length, 1),
      pageCount: 1,
    };
  }
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
