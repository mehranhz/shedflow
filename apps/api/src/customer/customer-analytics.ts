import { Injectable, Logger } from '@nestjs/common';

/**
 * Lightweight server-side funnel events for the customer portal (T-081).
 * Emits structured logs; Prometheus counters can hook labels later (T-035).
 */
@Injectable()
export class CustomerAnalytics {
  private readonly logger = new Logger(CustomerAnalytics.name);

  track(
    event:
      | 'customer_registered'
      | 'customer_claimed'
      | 'customer_booked'
      | 'customer_export_requested'
      | 'customer_account_deleted'
      | 'customer_cancel_attempt',
    props: Record<string, unknown>,
  ): void {
    this.logger.log({
      msg: 'customer_analytics',
      event,
      ...props,
    });
  }
}
