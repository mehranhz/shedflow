export type CustomerEntity = {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  phone: string | null;
  timezone: string | null;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateCustomerData = {
  organizationId: string;
  email: string;
  name: string;
  phone?: string | null;
  timezone?: string | null;
  notes?: string;
};

export type UpdateCustomerData = Partial<{
  email: string;
  name: string;
  phone: string | null;
  timezone: string | null;
  notes: string;
}>;

export type UpsertCustomerInput = {
  email: string;
  name: string;
  phone?: string | null;
  timezone?: string | null;
};
