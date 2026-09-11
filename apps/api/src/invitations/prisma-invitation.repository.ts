import { Injectable } from '@nestjs/common';
import { Prisma, type Invitation as InvitationRecord } from '@shedflow/db';
import { EntityNotFoundError } from '../common/persistence';
import {
  PrismaModelDelegate,
  PrismaRepository,
} from '../prisma/prisma.repository';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateInvitationData,
  Invitation,
  UpdateInvitationData,
} from './invitation';
import { InvitationRepository } from './invitation.repository';

@Injectable()
export class PrismaInvitationRepository
  extends PrismaRepository<
    InvitationRecord,
    Invitation,
    CreateInvitationData,
    UpdateInvitationData
  >
  implements InvitationRepository
{
  constructor(prisma: PrismaService) {
    super(prisma, 'Invitation');
  }

  protected delegate(
    client: Prisma.TransactionClient,
  ): PrismaModelDelegate<InvitationRecord> {
    return client.invitation;
  }

  protected toEntity(record: InvitationRecord): Invitation {
    return {
      id: record.id,
      organizationId: record.organizationId,
      email: record.email,
      role: record.role,
      tokenHash: record.tokenHash,
      invitedById: record.invitedById,
      expiresAt: record.expiresAt,
      acceptedAt: record.acceptedAt,
      createdAt: record.createdAt,
    };
  }

  findById(_id: string): Promise<Invitation | null> {
    return Promise.reject(
      new Error('Invitation lookups require organizationId'),
    );
  }

  findInOrganization(
    organizationId: string,
    id: string,
  ): Promise<Invitation | null> {
    return this.findOneWhere({ id, organizationId });
  }

  findByTokenHash(tokenHash: string): Promise<Invitation | null> {
    return this.findOneWhere({ tokenHash });
  }

  findPendingByEmail(
    organizationId: string,
    email: string,
  ): Promise<Invitation | null> {
    return this.findOneWhere({
      organizationId,
      email,
      acceptedAt: null,
    });
  }

  async deleteInOrganization(
    organizationId: string,
    id: string,
  ): Promise<void> {
    const existing = await this.findInOrganization(organizationId, id);
    if (!existing) {
      throw new EntityNotFoundError('Invitation', id);
    }
    return this.delete(id);
  }
}
