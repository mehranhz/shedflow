import { Injectable } from '@nestjs/common';
import {
  getOrCreateMetrics,
  type ShedflowMetrics,
  type ShedflowServiceName,
} from './metrics.registry';

@Injectable()
export class MetricsService {
  private readonly service: ShedflowServiceName;
  private readonly metrics: ShedflowMetrics;

  constructor(serviceName: ShedflowServiceName) {
    this.service = serviceName;
    this.metrics = getOrCreateMetrics(serviceName);
  }

  async scrape(): Promise<string> {
    return this.metrics.registry.metrics();
  }

  contentType(): string {
    return this.metrics.registry.contentType;
  }

  observeHttp(input: {
    method: string;
    route: string;
    status: number;
    durationSeconds: number;
  }): void {
    const labels = {
      service: this.service,
      method: input.method,
      route: input.route,
      status: String(input.status),
    };
    this.metrics.httpRequestDuration.observe(labels, input.durationSeconds);
    this.metrics.httpRequestsTotal.inc(labels);
  }

  recordBookingCreated(status: string): void {
    this.metrics.bookingCreatedTotal.inc({ status });
  }

  observeSlotQuery(durationSeconds: number, stale: boolean): void {
    this.metrics.slotQueryDuration.observe(
      { stale: stale ? 'true' : 'false' },
      durationSeconds,
    );
  }

  setOutboxPending(count: number): void {
    this.metrics.outboxPending.set(count);
  }

  recordPgbossFailed(name: string): void {
    this.metrics.pgbossFailedJobs.inc({ name });
  }

  recordStripeWebhook(type: string, result: 'ok' | 'error'): void {
    this.metrics.stripeWebhookTotal.inc({ type, result });
  }

  recordCalendarSyncError(provider: string): void {
    this.metrics.calendarSyncErrorsTotal.inc({ provider });
  }
}
