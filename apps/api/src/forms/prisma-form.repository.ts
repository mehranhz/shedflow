import { Injectable } from '@nestjs/common';
import { FormAssignmentStatus, Prisma } from '@shedflow/db';
import { PrismaService } from '../prisma/prisma.service';
import {
  FormAssignmentEntity,
  FormFieldSchema,
  FormSubmissionEntity,
  FormTemplateEntity,
} from './form';
import {
  FormAssignmentRepository,
  FormSubmissionRepository,
  FormTemplateRepository,
} from './form.repository';

function mapTemplate(row: {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  schema: Prisma.JsonValue;
  version: number;
  isActive: boolean;
  requiredBeforeConfirm: boolean;
  createdAt: Date;
  updatedAt: Date;
}): FormTemplateEntity {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    description: row.description,
    schema: (row.schema as FormFieldSchema[]) ?? [],
    version: row.version,
    isActive: row.isActive,
    requiredBeforeConfirm: row.requiredBeforeConfirm,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapAssignment(row: {
  id: string;
  organizationId: string;
  bookingId: string;
  customerId: string;
  formTemplateId: string;
  templateVersion: number;
  status: FormAssignmentStatus;
  requiredBeforeConfirm: boolean;
  createdAt: Date;
  updatedAt: Date;
}): FormAssignmentEntity {
  return { ...row };
}

function mapSubmission(row: {
  id: string;
  assignmentId: string;
  organizationId: string;
  customerId: string;
  formTemplateId: string;
  templateVersion: number;
  version: number;
  answers: Prisma.JsonValue;
  signatureName: string | null;
  waiverAccepted: boolean;
  signedAt: Date | null;
  signerIp: string | null;
  userAgent: string | null;
  createdAt: Date;
}): FormSubmissionEntity {
  return {
    ...row,
    answers: (row.answers as Record<string, unknown>) ?? {},
  };
}

@Injectable()
export class PrismaFormTemplateRepository extends FormTemplateRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(data: {
    organizationId: string;
    name: string;
    description?: string;
    schema: FormFieldSchema[];
    requiredBeforeConfirm?: boolean;
  }): Promise<FormTemplateEntity> {
    const row = await this.prisma.formTemplate.create({
      data: {
        organizationId: data.organizationId,
        name: data.name,
        description: data.description ?? '',
        schema: data.schema as unknown as Prisma.InputJsonValue,
        requiredBeforeConfirm: data.requiredBeforeConfirm ?? true,
      },
    });
    return mapTemplate(row);
  }

  async findByIdInOrganization(
    organizationId: string,
    id: string,
  ): Promise<FormTemplateEntity | null> {
    const row = await this.prisma.formTemplate.findFirst({
      where: { id, organizationId },
    });
    return row ? mapTemplate(row) : null;
  }

  async listInOrganization(
    organizationId: string,
  ): Promise<FormTemplateEntity[]> {
    const rows = await this.prisma.formTemplate.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(mapTemplate);
  }

  async updateInOrganization(
    organizationId: string,
    id: string,
    data: Partial<{
      name: string;
      description: string;
      schema: FormFieldSchema[];
      requiredBeforeConfirm: boolean;
      isActive: boolean;
      version: number;
    }>,
  ): Promise<FormTemplateEntity> {
    const row = await this.prisma.formTemplate.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined
          ? { description: data.description }
          : {}),
        ...(data.schema !== undefined
          ? { schema: data.schema as unknown as Prisma.InputJsonValue }
          : {}),
        ...(data.requiredBeforeConfirm !== undefined
          ? { requiredBeforeConfirm: data.requiredBeforeConfirm }
          : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.version !== undefined ? { version: data.version } : {}),
      },
    });
    if (row.organizationId !== organizationId) {
      throw new Error('organization mismatch');
    }
    return mapTemplate(row);
  }

  async attachToEventType(input: {
    eventTypeId: string;
    formTemplateId: string;
    requiredBeforeConfirm: boolean;
  }): Promise<void> {
    await this.prisma.eventTypeFormTemplate.upsert({
      where: {
        eventTypeId_formTemplateId: {
          eventTypeId: input.eventTypeId,
          formTemplateId: input.formTemplateId,
        },
      },
      create: {
        eventTypeId: input.eventTypeId,
        formTemplateId: input.formTemplateId,
        requiredBeforeConfirm: input.requiredBeforeConfirm,
      },
      update: { requiredBeforeConfirm: input.requiredBeforeConfirm },
    });
  }

  async listForEventType(eventTypeId: string) {
    const rows = await this.prisma.eventTypeFormTemplate.findMany({
      where: { eventTypeId },
      include: { formTemplate: true },
    });
    return rows.map((row) => ({
      formTemplateId: row.formTemplateId,
      requiredBeforeConfirm: row.requiredBeforeConfirm,
      template: mapTemplate(row.formTemplate),
    }));
  }
}

@Injectable()
export class PrismaFormAssignmentRepository extends FormAssignmentRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async createMany(
    rows: Array<{
      organizationId: string;
      bookingId: string;
      customerId: string;
      formTemplateId: string;
      templateVersion: number;
      requiredBeforeConfirm: boolean;
    }>,
  ): Promise<FormAssignmentEntity[]> {
    if (rows.length === 0) return [];
    const created: FormAssignmentEntity[] = [];
    for (const row of rows) {
      const item = await this.prisma.formAssignment.upsert({
        where: {
          bookingId_formTemplateId: {
            bookingId: row.bookingId,
            formTemplateId: row.formTemplateId,
          },
        },
        create: row,
        update: {},
      });
      created.push(mapAssignment(item));
    }
    return created;
  }

  async findById(id: string) {
    const row = await this.prisma.formAssignment.findUnique({
      where: { id },
      include: {
        formTemplate: true,
        submissions: { orderBy: { version: 'desc' }, take: 1 },
      },
    });
    if (!row) return null;
    return {
      ...mapAssignment(row),
      formTemplate: mapTemplate(row.formTemplate),
      latestSubmission: row.submissions[0]
        ? mapSubmission(row.submissions[0])
        : null,
    };
  }

  async findByBooking(organizationId: string, bookingId: string) {
    const rows = await this.prisma.formAssignment.findMany({
      where: { organizationId, bookingId },
    });
    return rows.map(mapAssignment);
  }

  async listIncompleteRequired(organizationId: string, bookingId: string) {
    const rows = await this.prisma.formAssignment.findMany({
      where: {
        organizationId,
        bookingId,
        requiredBeforeConfirm: true,
        status: FormAssignmentStatus.PENDING,
      },
    });
    return rows.map(mapAssignment);
  }

  async markCompleted(id: string) {
    const row = await this.prisma.formAssignment.update({
      where: { id },
      data: { status: FormAssignmentStatus.COMPLETED },
    });
    return mapAssignment(row);
  }

  async listForCustomerUser(userId: string) {
    const rows = await this.prisma.formAssignment.findMany({
      where: { customer: { userId } },
      include: {
        formTemplate: { select: { id: true, name: true, schema: true } },
        organization: { select: { id: true, name: true, slug: true } },
        booking: { select: { id: true, uid: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => ({
      ...mapAssignment(row),
      formTemplate: {
        id: row.formTemplate.id,
        name: row.formTemplate.name,
        schema: (row.formTemplate.schema as FormFieldSchema[]) ?? [],
      },
      organization: row.organization,
      booking: row.booking,
    }));
  }
}

@Injectable()
export class PrismaFormSubmissionRepository extends FormSubmissionRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(data: {
    assignmentId: string;
    organizationId: string;
    customerId: string;
    formTemplateId: string;
    templateVersion: number;
    version: number;
    answers: Record<string, unknown>;
    signatureName: string | null;
    waiverAccepted: boolean;
    signedAt: Date | null;
    signerIp: string | null;
    userAgent: string | null;
  }): Promise<FormSubmissionEntity> {
    const row = await this.prisma.formSubmission.create({
      data: {
        ...data,
        answers: data.answers as Prisma.InputJsonValue,
      },
    });
    return mapSubmission(row);
  }

  async latestVersion(assignmentId: string): Promise<number> {
    const row = await this.prisma.formSubmission.findFirst({
      where: { assignmentId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    return row?.version ?? 0;
  }

  async findLatestByAssignment(assignmentId: string) {
    const row = await this.prisma.formSubmission.findFirst({
      where: { assignmentId },
      orderBy: { version: 'desc' },
    });
    return row ? mapSubmission(row) : null;
  }

  async listForCustomerUser(userId: string) {
    const rows = await this.prisma.formSubmission.findMany({
      where: { customer: { userId } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(mapSubmission);
  }
}
