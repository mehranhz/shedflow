import { Injectable } from '@nestjs/common';
import { Prisma, type Organization as OrganizationRecord } from '@shedflow/db';
import {
  PrismaModelDelegate,
  PrismaRepository,
} from '../prisma/prisma.repository';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateOrganizationData,
  Organization,
  UpdateOrganizationData,
} from './organization';
import { OrganizationRepository } from './organization.repository';

@Injectable()
export class PrismaOrganizationRepository
  extends PrismaRepository<
    OrganizationRecord,
    Organization,
    CreateOrganizationData,
    UpdateOrganizationData
  >
  implements OrganizationRepository
{
  constructor(prisma: PrismaService) {
    super(prisma, 'Organization');
  }

  protected delegate(
    client: Prisma.TransactionClient,
  ): PrismaModelDelegate<OrganizationRecord> {
    return client.organization;
  }

  protected toEntity(record: OrganizationRecord): Organization {
    return {
      id: record.id,
      name: record.name,
      slug: record.slug,
      timezone: record.timezone,
      locale: record.locale,
      currency: record.currency,
      logoUrl: record.logoUrl,
      brandColor: record.brandColor,
      platformPlan: record.platformPlan,
      settings: asSettings(record.settings),
      deletedAt: record.deletedAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  findBySlug(slug: string): Promise<Organization | null> {
    return this.findOneWhere({ slug, deletedAt: null });
  }

  findActiveById(id: string): Promise<Organization | null> {
    return this.findOneWhere({ id, deletedAt: null });
  }
}

function asSettings(value: Prisma.JsonValue): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}
