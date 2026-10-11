import { FormAssignmentStatus } from '@shedflow/db';

export type FormFieldSchema = {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'checkbox' | 'signature' | 'file' | 'waiver';
  required?: boolean;
};

export type FormTemplateEntity = {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  schema: FormFieldSchema[];
  version: number;
  isActive: boolean;
  requiredBeforeConfirm: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type FormAssignmentEntity = {
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
};

export type FormSubmissionEntity = {
  id: string;
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
  createdAt: Date;
};
