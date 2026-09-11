import { MembershipStatus, Role } from '@shedflow/db';

export type Membership = {
  id: string;
  organizationId: string;
  userId: string;
  role: Role;
  status: MembershipStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateMembershipData = {
  organizationId: string;
  userId: string;
  role: Role;
  status?: MembershipStatus;
};

export type UpdateMembershipData = Partial<{
  role: Role;
  status: MembershipStatus;
}>;
