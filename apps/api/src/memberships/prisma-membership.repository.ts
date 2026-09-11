import { Injectable } from '@nestjs/common';
import { Prisma, type Membership as MembershipRecord } from '@shedflow/db';
import { EntityNotFoundError } from '../common/persistence';
import {
  PrismaModelDelegate,
  PrismaRepository,
} from '../prisma/prisma.repository';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateMembershipData,
  Membership,
  UpdateMembershipData,
} from './membership';
import { MembershipRepository } from './membership.repository';

@Injectable()
export class PrismaMembershipRepository
  extends PrismaRepository<
    MembershipRecord,
    Membership,
    CreateMembershipData,
    UpdateMembershipData
  >
  implements MembershipRepository
{
  constructor(prisma: PrismaService) {
    super(prisma, 'Membership');
  }

  protected delegate(
    client: Prisma.TransactionClient,
  ): PrismaModelDelegate<MembershipRecord> {
    return client.membership;
  }

  protected toEntity(record: MembershipRecord): Membership {
    return {
      id: record.id,
      organizationId: record.organizationId,
      userId: record.userId,
      role: record.role,
      status: record.status,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  findById(_id: string): Promise<Membership | null> {
    return Promise.reject(
      new Error('Membership lookups require organizationId'),
    );
  }

  findInOrganization(
    organizationId: string,
    id: string,
  ): Promise<Membership | null> {
    return this.findOneWhere({ id, organizationId });
  }

  findByUserInOrganization(
    organizationId: string,
    userId: string,
  ): Promise<Membership | null> {
    return this.findOneWhere({ organizationId, userId });
  }

  listByOrganization(organizationId: string): Promise<Membership[]> {
    return this.findManyWhere({ organizationId });
  }

  listByUserId(userId: string): Promise<Membership[]> {
    return this.findManyWhere({ userId });
  }

  async updateInOrganization(
    organizationId: string,
    id: string,
    data: UpdateMembershipData,
  ): Promise<Membership> {
    const existing = await this.findInOrganization(organizationId, id);
    if (!existing) {
      throw new EntityNotFoundError('Membership', id);
    }
    return this.update(id, data);
  }

  async deleteInOrganization(
    organizationId: string,
    id: string,
  ): Promise<void> {
    const existing = await this.findInOrganization(organizationId, id);
    if (!existing) {
      throw new EntityNotFoundError('Membership', id);
    }
    return this.delete(id);
  }
}
