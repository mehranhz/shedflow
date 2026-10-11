import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FavoriteKind } from '@shedflow/db';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import type { PortalCustomerContext } from '../portal-context';

export type FavoriteView = {
  id: string;
  organizationId: string;
  customerId: string;
  kind: FavoriteKind;
  refId: string;
  createdAt: Date;
};

@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  list(ctx: PortalCustomerContext): Promise<FavoriteView[]> {
    return this.prisma.customerFavorite.findMany({
      where: {
        organizationId: ctx.organizationId,
        customerId: ctx.customerId,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async add(
    ctx: PortalCustomerContext,
    input: { kind: FavoriteKind; refId: string },
  ): Promise<FavoriteView> {
    if (!Object.values(FavoriteKind).includes(input.kind)) {
      throw new BadRequestException({
        fieldErrors: { kind: ['Invalid kind'] },
      });
    }
    await this.assertRefInTenant(ctx.organizationId, input.kind, input.refId);

    try {
      return await this.prisma.customerFavorite.create({
        data: {
          id: randomUUID(),
          organizationId: ctx.organizationId,
          customerId: ctx.customerId,
          kind: input.kind,
          refId: input.refId,
        },
      });
    } catch {
      const existing = await this.prisma.customerFavorite.findFirst({
        where: {
          organizationId: ctx.organizationId,
          customerId: ctx.customerId,
          kind: input.kind,
          refId: input.refId,
        },
      });
      if (existing) {
        return existing;
      }
      throw new BadRequestException('Could not add favorite');
    }
  }

  async remove(ctx: PortalCustomerContext, id: string): Promise<void> {
    const row = await this.prisma.customerFavorite.findFirst({
      where: {
        id,
        organizationId: ctx.organizationId,
        customerId: ctx.customerId,
      },
    });
    if (!row) {
      throw new NotFoundException('Not found');
    }
    await this.prisma.customerFavorite.delete({ where: { id } });
  }

  private async assertRefInTenant(
    organizationId: string,
    kind: FavoriteKind,
    refId: string,
  ): Promise<void> {
    if (kind === FavoriteKind.SERVICE) {
      const et = await this.prisma.eventType.findFirst({
        where: { id: refId, organizationId },
      });
      if (!et) {
        throw new NotFoundException('Not found');
      }
      return;
    }
    if (kind === FavoriteKind.STAFF) {
      const membership = await this.prisma.membership.findFirst({
        where: { organizationId, userId: refId },
      });
      if (!membership) {
        throw new NotFoundException('Not found');
      }
      return;
    }
    // LOCATION — store opaque UUID scoped by org; reject if used as another org's event type id
    const foreign = await this.prisma.eventType.findFirst({
      where: { id: refId, NOT: { organizationId } },
    });
    if (foreign) {
      throw new NotFoundException('Not found');
    }
  }
}
