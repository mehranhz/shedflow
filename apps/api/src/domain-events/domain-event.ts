export type DomainEvent = {
  id: string;
  organizationId: string | null;
  type: string;
  payload: Record<string, unknown>;
  status: 'PENDING' | 'PROCESSED' | 'FAILED';
  attempts: number;
  availableAt: Date;
  processedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
};

export type CreateDomainEventData = {
  organizationId?: string | null;
  type: string;
  payload: Record<string, unknown>;
  availableAt?: Date;
};

export type UpdateDomainEventData = Partial<{
  status: DomainEvent['status'];
  attempts: number;
  availableAt: Date;
  processedAt: Date | null;
  lastError: string | null;
}>;
