import { FormAssignmentStatus } from '@shedflow/db';
import {
  FormAssignmentEntity,
  FormFieldSchema,
  FormSubmissionEntity,
  FormTemplateEntity,
} from './form';

export abstract class FormTemplateRepository {
  abstract create(data: {
    organizationId: string;
    name: string;
    description?: string;
    schema: FormFieldSchema[];
    requiredBeforeConfirm?: boolean;
  }): Promise<FormTemplateEntity>;

  abstract findByIdInOrganization(
    organizationId: string,
    id: string,
  ): Promise<FormTemplateEntity | null>;

  abstract listInOrganization(
    organizationId: string,
  ): Promise<FormTemplateEntity[]>;

  abstract updateInOrganization(
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
  ): Promise<FormTemplateEntity>;

  abstract attachToEventType(input: {
    eventTypeId: string;
    formTemplateId: string;
    requiredBeforeConfirm: boolean;
  }): Promise<void>;

  abstract listForEventType(eventTypeId: string): Promise<
    Array<{
      formTemplateId: string;
      requiredBeforeConfirm: boolean;
      template: FormTemplateEntity;
    }>
  >;
}

export abstract class FormAssignmentRepository {
  abstract createMany(
    rows: Array<{
      organizationId: string;
      bookingId: string;
      customerId: string;
      formTemplateId: string;
      templateVersion: number;
      requiredBeforeConfirm: boolean;
    }>,
  ): Promise<FormAssignmentEntity[]>;

  abstract findById(id: string): Promise<
    | (FormAssignmentEntity & {
        formTemplate: FormTemplateEntity;
        latestSubmission: FormSubmissionEntity | null;
      })
    | null
  >;

  abstract findByBooking(
    organizationId: string,
    bookingId: string,
  ): Promise<FormAssignmentEntity[]>;

  abstract listIncompleteRequired(
    organizationId: string,
    bookingId: string,
  ): Promise<FormAssignmentEntity[]>;

  abstract markCompleted(id: string): Promise<FormAssignmentEntity>;

  abstract listForCustomerUser(userId: string): Promise<
    Array<
      FormAssignmentEntity & {
        formTemplate: Pick<FormTemplateEntity, 'id' | 'name' | 'schema'>;
        organization: { id: string; name: string; slug: string };
        booking: { id: string; uid: string; status: string };
      }
    >
  >;
}

export abstract class FormSubmissionRepository {
  abstract create(data: {
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
  }): Promise<FormSubmissionEntity>;

  abstract latestVersion(assignmentId: string): Promise<number>;

  abstract findLatestByAssignment(
    assignmentId: string,
  ): Promise<FormSubmissionEntity | null>;

  abstract listForCustomerUser(userId: string): Promise<FormSubmissionEntity[]>;
}

export type { FormAssignmentStatus };
