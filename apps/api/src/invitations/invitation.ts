import { Role } from '@shedflow/db';

export type Invitation = {
  id: string;
  organizationId: string;
  email: string;
  role: Role;
  tokenHash: string;
  invitedById: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
};

export type CreateInvitationData = {
  organizationId: string;
  email: string;
  role: Role;
  tokenHash: string;
  invitedById: string;
  expiresAt: Date;
};

export type UpdateInvitationData = Partial<{
  acceptedAt: Date | null;
}>;
