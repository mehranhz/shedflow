import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { PaymentGateway } from '../payments/payment-gateway';
import { StripeWebhooksService } from './stripe-webhooks.service';

@Public()
@Controller('webhooks')
export class StripeWebhooksController {
  constructor(
    private readonly gateway: PaymentGateway,
    private readonly config: ConfigService,
    private readonly webhooks: StripeWebhooksService,
  ) {}

  @Post('stripe')
  @HttpCode(200)
  async handle(
    @Req() req: Request,
    @Headers('stripe-signature') signature?: string,
  ): Promise<{ received: true }> {
    if (!signature) {
      throw new BadRequestException({
        message: 'Missing Stripe-Signature header',
      });
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new BadRequestException({
        message: 'Missing raw body',
      });
    }

    const event = this.constructEvent(rawBody, signature);
    return this.webhooks.handleEvent(event);
  }

  private constructEvent(
    rawBody: Buffer,
    signature: string,
  ): ReturnType<PaymentGateway['constructWebhookEvent']> {
    const secrets = [
      this.config.getOrThrow<string>('STRIPE_WEBHOOK_SECRET'),
      this.config.getOrThrow<string>('STRIPE_CONNECT_WEBHOOK_SECRET'),
    ];
    const unique = [...new Set(secrets)];
    for (const secret of unique) {
      try {
        return this.gateway.constructWebhookEvent(rawBody, signature, secret);
      } catch {
        // Try the other webhook secret (platform vs Connect).
      }
    }
    throw new BadRequestException({
      message: 'Invalid Stripe signature',
    });
  }
}
