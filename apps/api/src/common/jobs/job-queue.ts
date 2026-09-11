/**
 * Application-facing job port. The API implementation only writes `domain_events`
 * (outbox). pg-boss lives in `apps/worker`.
 */
export abstract class JobQueue {
  abstract enqueue(
    type: string,
    payload: Record<string, unknown>,
    organizationId?: string | null,
  ): Promise<void>;
}
