import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from 'prom-client';

export type ShedflowServiceName = 'api' | 'billing' | 'worker';

export type ShedflowMetrics = {
  registry: Registry;
  httpRequestDuration: Histogram<string>;
  httpRequestsTotal: Counter<string>;
  bookingCreatedTotal: Counter<string>;
  slotQueryDuration: Histogram<string>;
  outboxPending: Gauge<string>;
  pgbossFailedJobs: Counter<string>;
  stripeWebhookTotal: Counter<string>;
  calendarSyncErrorsTotal: Counter<string>;
};

const registries = new Map<string, ShedflowMetrics>();

/** Process-wide metrics for one Nest service (idempotent). */
export function getOrCreateMetrics(service: ShedflowServiceName): ShedflowMetrics {
  const existing = registries.get(service);
  if (existing) {
    return existing;
  }

  const registry = new Registry();
  registry.setDefaultLabels({ service });
  collectDefaultMetrics({ register: registry });

  const httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['service', 'method', 'route', 'status'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [registry],
  });

  const httpRequestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total HTTP requests',
    labelNames: ['service', 'method', 'route', 'status'],
    registers: [registry],
  });

  const bookingCreatedTotal = new Counter({
    name: 'booking_created_total',
    help: 'Bookings created by status',
    labelNames: ['status'],
    registers: [registry],
  });

  const slotQueryDuration = new Histogram({
    name: 'slot_query_duration_seconds',
    help: 'Public slot query duration',
    labelNames: ['stale'],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2],
    registers: [registry],
  });

  const outboxPending = new Gauge({
    name: 'outbox_pending',
    help: 'Pending domain_events awaiting worker',
    registers: [registry],
  });

  const pgbossFailedJobs = new Counter({
    name: 'pgboss_failed_jobs',
    help: 'pg-boss jobs that failed',
    labelNames: ['name'],
    registers: [registry],
  });

  const stripeWebhookTotal = new Counter({
    name: 'stripe_webhook_total',
    help: 'Stripe webhook outcomes',
    labelNames: ['type', 'result'],
    registers: [registry],
  });

  const calendarSyncErrorsTotal = new Counter({
    name: 'calendar_sync_errors_total',
    help: 'Calendar sync failures',
    labelNames: ['provider'],
    registers: [registry],
  });

  const metrics: ShedflowMetrics = {
    registry,
    httpRequestDuration,
    httpRequestsTotal,
    bookingCreatedTotal,
    slotQueryDuration,
    outboxPending,
    pgbossFailedJobs,
    stripeWebhookTotal,
    calendarSyncErrorsTotal,
  };
  registries.set(service, metrics);
  return metrics;
}
