import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BookingStatus, FormAssignmentStatus } from '@shedflow/db';
import { PrismaService } from '../prisma/prisma.service';
import { FormFieldSchema, FormTemplateEntity } from './form';
import {
  FormAssignmentRepository,
  FormSubmissionRepository,
  FormTemplateRepository,
} from './form.repository';

const ALLOWED_UPLOAD_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

/**
 * Policy (T-073): required form assignments block CONFIRMED.
 * Bookings with required forms start as PENDING_CONFIRMATION (unless paid hold).
 * After all required submissions, auto-confirm when the event type does not
 * otherwise require host confirmation and payment is not pending.
 */
@Injectable()
export class FormsService {
  private readonly signingSecret: string;

  constructor(
    private readonly templates: FormTemplateRepository,
    private readonly assignments: FormAssignmentRepository,
    private readonly submissions: FormSubmissionRepository,
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.signingSecret =
      config.get<string>('ENCRYPTION_KEY')?.trim() ||
      config.getOrThrow<string>('JWT_SECRET');
  }

  createTemplate(
    organizationId: string,
    input: {
      name: string;
      description?: string;
      schema: FormFieldSchema[];
      requiredBeforeConfirm?: boolean;
    },
  ) {
    return this.templates.create({ organizationId, ...input });
  }

  listTemplates(organizationId: string) {
    return this.templates.listInOrganization(organizationId);
  }

  async getTemplate(organizationId: string, id: string) {
    const tpl = await this.templates.findByIdInOrganization(organizationId, id);
    if (!tpl) throw new NotFoundException('Form template not found');
    return tpl;
  }

  async updateTemplate(
    organizationId: string,
    id: string,
    input: Partial<{
      name: string;
      description: string;
      schema: FormFieldSchema[];
      requiredBeforeConfirm: boolean;
      isActive: boolean;
    }>,
  ) {
    await this.getTemplate(organizationId, id);
    const bumpVersion = input.schema !== undefined;
    return this.templates.updateInOrganization(organizationId, id, {
      ...input,
      ...(bumpVersion
        ? {
            version:
              (
                await this.templates.findByIdInOrganization(organizationId, id)
              )!.version + 1,
          }
        : {}),
    });
  }

  async attachToEventType(
    organizationId: string,
    eventTypeId: string,
    formTemplateId: string,
    requiredBeforeConfirm = true,
  ) {
    const et = await this.prisma.eventType.findFirst({
      where: { id: eventTypeId, organizationId },
    });
    if (!et) throw new NotFoundException('Event type not found');
    await this.getTemplate(organizationId, formTemplateId);
    await this.templates.attachToEventType({
      eventTypeId,
      formTemplateId,
      requiredBeforeConfirm,
    });
    return { ok: true as const };
  }

  async createAssignmentsForBooking(input: {
    organizationId: string;
    bookingId: string;
    customerId: string;
    eventTypeId: string;
  }) {
    const links = await this.templates.listForEventType(input.eventTypeId);
    const active = links.filter((l) => l.template.isActive);
    if (active.length === 0) return [];
    return this.assignments.createMany(
      active.map((l) => ({
        organizationId: input.organizationId,
        bookingId: input.bookingId,
        customerId: input.customerId,
        formTemplateId: l.formTemplateId,
        templateVersion: l.template.version,
        requiredBeforeConfirm: l.requiredBeforeConfirm,
      })),
    );
  }

  async hasIncompleteRequiredForms(
    organizationId: string,
    bookingId: string,
  ): Promise<boolean> {
    const pending = await this.assignments.listIncompleteRequired(
      organizationId,
      bookingId,
    );
    return pending.length > 0;
  }

  async assertCanConfirm(
    organizationId: string,
    bookingId: string,
  ): Promise<void> {
    if (await this.hasIncompleteRequiredForms(organizationId, bookingId)) {
      throw new ConflictException({
        code: 'ACTIONS_NEEDED',
        message: 'Required waiver/form must be completed before confirmation',
      });
    }
  }

  async eventTypeRequiresForms(eventTypeId: string): Promise<boolean> {
    const links = await this.templates.listForEventType(eventTypeId);
    return links.some((l) => l.template.isActive && l.requiredBeforeConfirm);
  }

  async getAssignmentForUser(assignmentId: string, userId: string) {
    const assignment = await this.assignments.findById(assignmentId);
    if (!assignment) throw new NotFoundException('Assignment not found');
    const customer = await this.prisma.customer.findFirst({
      where: { id: assignment.customerId, userId },
    });
    if (!customer) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Not your form assignment',
      });
    }
    return assignment;
  }

  async getAssignmentPublic(assignmentId: string, bookingUid: string) {
    const assignment = await this.assignments.findById(assignmentId);
    if (!assignment) throw new NotFoundException('Assignment not found');
    const booking = await this.prisma.booking.findFirst({
      where: { id: assignment.bookingId, uid: bookingUid },
    });
    if (!booking) throw new NotFoundException('Assignment not found');
    return assignment;
  }

  listAssignmentsForUser(userId: string) {
    return this.assignments.listForCustomerUser(userId);
  }

  createUploadUrl(input: {
    assignmentId: string;
    fieldKey: string;
    mimeType: string;
    sizeBytes: number;
  }) {
    if (!ALLOWED_UPLOAD_MIMES.has(input.mimeType)) {
      throw new BadRequestException({
        code: 'INVALID_MIME',
        message: `MIME type not allowed: ${input.mimeType}`,
      });
    }
    if (input.sizeBytes <= 0 || input.sizeBytes > 10 * 1024 * 1024) {
      throw new BadRequestException({
        code: 'INVALID_SIZE',
        message: 'File must be between 1 byte and 10MB',
      });
    }
    const storageKey = `forms/${input.assignmentId}/${input.fieldKey}/${randomUUID()}`;
    const exp = Math.floor(Date.now() / 1000) + 15 * 60;
    const payload = `${storageKey}|${input.mimeType}|${exp}`;
    const sig = createHmac('sha256', this.signingSecret)
      .update(payload)
      .digest('base64url');
    return {
      storageKey,
      uploadUrl: `/v1/customer/forms/uploads?key=${encodeURIComponent(storageKey)}&mime=${encodeURIComponent(input.mimeType)}&exp=${exp}&sig=${sig}`,
      expiresAt: new Date(exp * 1000).toISOString(),
      allowedMimeTypes: [...ALLOWED_UPLOAD_MIMES],
    };
  }

  verifyUploadSignature(input: {
    storageKey: string;
    mimeType: string;
    exp: number;
    sig: string;
  }): void {
    if (input.exp * 1000 < Date.now()) {
      throw new ForbiddenException({ code: 'EXPIRED', message: 'Upload URL expired' });
    }
    if (!ALLOWED_UPLOAD_MIMES.has(input.mimeType)) {
      throw new BadRequestException({ code: 'INVALID_MIME', message: 'Bad MIME' });
    }
    const payload = `${input.storageKey}|${input.mimeType}|${input.exp}`;
    const expected = createHmac('sha256', this.signingSecret)
      .update(payload)
      .digest('base64url');
    const a = Buffer.from(expected);
    const b = Buffer.from(input.sig);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Invalid signature' });
    }
  }

  async submitAssignment(input: {
    assignmentId: string;
    answers: Record<string, unknown>;
    signatureName?: string;
    waiverAccepted?: boolean;
    signerIp?: string;
    userAgent?: string;
    /** When set, enforce ownership via Customer.userId */
    userId?: string;
    bookingUid?: string;
  }) {
    let assignment;
    if (input.userId) {
      assignment = await this.getAssignmentForUser(
        input.assignmentId,
        input.userId,
      );
    } else if (input.bookingUid) {
      assignment = await this.getAssignmentPublic(
        input.assignmentId,
        input.bookingUid,
      );
    } else {
      throw new ForbiddenException('Auth required');
    }

    this.validateAnswers(assignment.formTemplate.schema, input.answers, {
      signatureName: input.signatureName,
      waiverAccepted: input.waiverAccepted,
    });

    const nextVersion =
      (await this.submissions.latestVersion(assignment.id)) + 1;
    const now = new Date();
    const submission = await this.submissions.create({
      assignmentId: assignment.id,
      organizationId: assignment.organizationId,
      customerId: assignment.customerId,
      formTemplateId: assignment.formTemplateId,
      templateVersion: assignment.templateVersion,
      version: nextVersion,
      answers: input.answers,
      signatureName: input.signatureName ?? null,
      waiverAccepted: Boolean(input.waiverAccepted),
      signedAt:
        input.waiverAccepted || input.signatureName ? now : null,
      signerIp: input.signerIp ?? null,
      userAgent: input.userAgent ?? null,
    });

    await this.assignments.markCompleted(assignment.id);

    const autoConfirmed = await this.maybeAutoConfirm(assignment.bookingId);

    return { submission, autoConfirmed };
  }

  private validateAnswers(
    schema: FormFieldSchema[],
    answers: Record<string, unknown>,
    extras: { signatureName?: string; waiverAccepted?: boolean },
  ) {
    for (const field of schema) {
      if (!field.required) continue;
      if (field.type === 'waiver') {
        if (!extras.waiverAccepted) {
          throw new BadRequestException({
            code: 'WAIVER_REQUIRED',
            message: `Waiver required: ${field.key}`,
          });
        }
        continue;
      }
      if (field.type === 'signature') {
        if (!extras.signatureName?.trim()) {
          throw new BadRequestException({
            code: 'SIGNATURE_REQUIRED',
            message: `Signature required: ${field.key}`,
          });
        }
        continue;
      }
      const value = answers[field.key];
      if (value === undefined || value === null || value === '') {
        throw new BadRequestException({
          code: 'FIELD_REQUIRED',
          message: `Field required: ${field.key}`,
        });
      }
    }
  }

  private async maybeAutoConfirm(bookingId: string): Promise<boolean> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { eventType: true },
    });
    if (!booking) return false;
    if (booking.status !== BookingStatus.PENDING_CONFIRMATION) return false;
    if (booking.eventType.requiresConfirmation) return false;
    if (booking.eventType.priceId) return false;
    if (
      await this.hasIncompleteRequiredForms(
        booking.organizationId,
        booking.id,
      )
    ) {
      return false;
    }
    // Leave confirm to BookingsService via caller to keep outbox consistent —
    // flag for controller/service orchestration.
    return true;
  }

  /** Used by bookings create path. */
  async shouldDeferConfirm(eventTypeId: string): Promise<boolean> {
    return this.eventTypeRequiresForms(eventTypeId);
  }
}
