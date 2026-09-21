import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  INTERNAL_SIGNATURE_HEADER,
  INTERNAL_TIMESTAMP_HEADER,
  internalTimestamp,
  signInternalRequest,
} from '@shedflow/shared';

export abstract class InternalBookingsClient {
  abstract expire(bookingId: string): Promise<void>;
  abstract confirm(bookingId: string): Promise<void>;
}

@Injectable()
export class HmacInternalBookingsClient extends InternalBookingsClient {
  private readonly logger = new Logger(HmacInternalBookingsClient.name);
  private readonly secret: string;
  private readonly apiUrl: string;

  constructor(config: ConfigService) {
    super();
    this.secret = config.getOrThrow<string>('INTERNAL_API_SECRET');
    this.apiUrl = (config.get<string>('API_URL') ?? 'http://localhost:3001').replace(
      /\/$/,
      '',
    );
  }

  expire(bookingId: string): Promise<void> {
    return this.post(`/internal/bookings/${bookingId}/expire`);
  }

  confirm(bookingId: string): Promise<void> {
    return this.post(`/internal/bookings/${bookingId}/confirm`);
  }

  private async post(path: string): Promise<void> {
    const timestamp = internalTimestamp();
    const signature = signInternalRequest({
      secret: this.secret,
      timestamp,
      method: 'POST',
      path,
      body: '',
    });
    const url = `${this.apiUrl}${path}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        [INTERNAL_TIMESTAMP_HEADER]: timestamp,
        [INTERNAL_SIGNATURE_HEADER]: signature,
      },
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      this.logger.warn(`internal ${path} → ${response.status} ${text}`);
      // 409 CONFLICT means booking already left PENDING_PAYMENT — treat as success (idempotent).
      if (response.status === 409) {
        return;
      }
      throw new Error(`internal ${path} failed: ${response.status}`);
    }
  }
}
