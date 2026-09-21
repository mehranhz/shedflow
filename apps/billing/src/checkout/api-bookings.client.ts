import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  INTERNAL_SIGNATURE_HEADER,
  INTERNAL_TIMESTAMP_HEADER,
  internalTimestamp,
  signInternalRequest,
} from '@shedflow/shared';

@Injectable()
export class ApiBookingsClient {
  private readonly logger = new Logger(ApiBookingsClient.name);

  constructor(private readonly config: ConfigService) {}

  async confirmBooking(bookingId: string): Promise<void> {
    await this.post(`/internal/bookings/${bookingId}/confirm`);
  }

  async expireBooking(bookingId: string): Promise<void> {
    await this.post(`/internal/bookings/${bookingId}/expire`);
  }

  private async post(path: string): Promise<void> {
    const base = this.config.getOrThrow<string>('API_URL').replace(/\/$/, '');
    const secret = this.config.getOrThrow<string>('INTERNAL_API_SECRET');
    const timestamp = internalTimestamp();
    const signature = signInternalRequest({
      secret,
      timestamp,
      method: 'POST',
      path,
      body: '',
    });

    try {
      const response = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: {
          [INTERNAL_TIMESTAMP_HEADER]: timestamp,
          [INTERNAL_SIGNATURE_HEADER]: signature,
        },
      });
      if (!response.ok && response.status !== 409) {
        const text = await response.text();
        this.logger.warn(
          `API ${path} failed status=${response.status} body=${text.slice(0, 200)}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `API ${path} unreachable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
