import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type LinkedCustomer = {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  userId: string | null;
};

/**
 * Resolves Customer rows linked to a portal user (Wave 9 `Customer.userId`).
 */
@Injectable()
export class LinkedCustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async findByUserId(userId: string): Promise<LinkedCustomer[]> {
    const rows = await this.prisma.customer.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      organizationId: r.organizationId,
      email: r.email,
      name: r.name,
      userId: r.userId,
    }));
  }

  async resolveScopedIds(
    userId: string,
    organizationId?: string,
  ): Promise<{ customers: LinkedCustomer[]; customerIds: string[] }> {
    let customers = await this.findByUserId(userId);
    if (organizationId) {
      customers = customers.filter((c) => c.organizationId === organizationId);
    }
    return {
      customers,
      customerIds: customers.map((c) => c.id),
    };
  }

  assertOwnsCustomer(
    customers: LinkedCustomer[],
    customerId: string,
  ): LinkedCustomer {
    const found = customers.find((c) => c.id === customerId);
    if (!found) {
      throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
    }
    return found;
  }
}
