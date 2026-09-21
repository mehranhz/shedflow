export type StripeEventRecord = {
  id: string;
  type: string;
  payload: unknown;
  processedAt: Date | null;
  createdAt: Date;
};

export abstract class StripeEventRepository {
  abstract tryInsert(
    id: string,
    type: string,
    payload: unknown,
  ): Promise<StripeEventRecord>;

  abstract markProcessed(id: string): Promise<void>;
}
