export type AuditLog = {
  id: string;
  organizationId: string | null;
  actorUserId: string | null;
  actorType: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  ip: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
};

export type CreateAuditLogData = {
  organizationId?: string | null;
  actorUserId?: string | null;
  actorType: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
};

export type UpdateAuditLogData = Partial<CreateAuditLogData>;
