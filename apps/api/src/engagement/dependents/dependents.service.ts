import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { OrgSettingsSchema } from '@shedflow/shared';
import { randomUUID } from 'node:crypto';
import { Clock } from '../../common/clock/clock';
import { PrismaService } from '../../prisma/prisma.service';

const DEFAULT_MAX_DEPENDENTS = 10;

export type DependentView = {
  id: string;
  name: string;
  dateOfBirth: Date | null;
  relationship: string;
  notes: string;
  guardianAttestedAt: Date | null;
  isMinor: boolean;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class DependentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async list(userId: string): Promise<DependentView[]> {
    const rows = await this.prisma.dependent.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => this.toView(row));
  }

  async create(
    userId: string,
    input: {
      name: string;
      dateOfBirth?: string | null;
      relationship?: string;
      notes?: string;
      guardianAttested?: boolean;
    },
    organizationIdForLimit?: string,
  ): Promise<DependentView> {
    const name = input.name?.trim() ?? '';
    if (!name) {
      throw new BadRequestException({
        fieldErrors: { name: ['Name is required'] },
      });
    }

    const dob = input.dateOfBirth ? new Date(input.dateOfBirth) : null;
    if (dob && Number.isNaN(dob.getTime())) {
      throw new BadRequestException({
        fieldErrors: { dateOfBirth: ['Invalid date'] },
      });
    }

    const isMinor = this.computeIsMinor(dob);
    if (isMinor && !input.guardianAttested) {
      throw new UnprocessableEntityException({
        code: 'GUARDIAN_ATTESTATION_REQUIRED',
        message: 'Guardian attestation required for dependents under 18',
      });
    }

    const max = await this.maxDependents(organizationIdForLimit);
    const count = await this.prisma.dependent.count({
      where: { userId, deletedAt: null },
    });
    if (count >= max) {
      throw new UnprocessableEntityException({
        code: 'MAX_DEPENDENTS',
        message: `Maximum of ${max} dependents allowed`,
      });
    }

    const now = this.clock.now();
    const row = await this.prisma.dependent.create({
      data: {
        id: randomUUID(),
        userId,
        name,
        dateOfBirth: dob,
        relationship: input.relationship?.trim() || 'child',
        notes: input.notes ?? '',
        guardianAttestedAt: isMinor ? now : null,
        updatedAt: now,
      },
    });
    return this.toView(row);
  }

  async softDelete(userId: string, id: string): Promise<void> {
    const row = await this.prisma.dependent.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!row) {
      throw new NotFoundException('Not found');
    }
    const now = this.clock.now();
    await this.prisma.dependent.update({
      where: { id },
      data: {
        deletedAt: now,
        displayNameSnapshot: row.name,
        updatedAt: now,
      },
    });
  }

  /** Display name for historical bookings (active or soft-deleted). */
  async displayName(userId: string, dependentId: string): Promise<string | null> {
    const row = await this.prisma.dependent.findFirst({
      where: { id: dependentId, userId },
    });
    if (!row) {
      return null;
    }
    return row.deletedAt ? (row.displayNameSnapshot ?? row.name) : row.name;
  }

  private async maxDependents(organizationId?: string): Promise<number> {
    if (!organizationId) {
      return DEFAULT_MAX_DEPENDENTS;
    }
    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId },
      select: { settings: true },
    });
    const parsed = OrgSettingsSchema.safeParse(org?.settings ?? {});
    return parsed.success
      ? (parsed.data.engagement?.maxDependents ?? DEFAULT_MAX_DEPENDENTS)
      : DEFAULT_MAX_DEPENDENTS;
  }

  private computeIsMinor(dob: Date | null): boolean {
    if (!dob) {
      return false;
    }
    const now = this.clock.now();
    const ageMs = now.getTime() - dob.getTime();
    const years = ageMs / (365.25 * 24 * 60 * 60 * 1000);
    return years < 18;
  }

  private toView(row: {
    id: string;
    name: string;
    dateOfBirth: Date | null;
    relationship: string;
    notes: string;
    guardianAttestedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): DependentView {
    return {
      id: row.id,
      name: row.name,
      dateOfBirth: row.dateOfBirth,
      relationship: row.relationship,
      notes: row.notes,
      guardianAttestedAt: row.guardianAttestedAt,
      isMinor: this.computeIsMinor(row.dateOfBirth),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
