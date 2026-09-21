import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { Mailer, SendMailInput, SendMailResult } from './mailer';

/** 4xx from Resend — do not retry. */
export class PermanentMailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentMailError';
  }
}

@Injectable()
export class ResendMailer extends Mailer {
  private readonly logger = new Logger(ResendMailer.name);
  private readonly client: Resend;
  private readonly from: string;

  constructor(config: ConfigService) {
    super();
    const apiKey = config.getOrThrow<string>('RESEND_API_KEY');
    this.client = new Resend(apiKey);
    this.from =
      config.get<string>('EMAIL_FROM') ??
      'SchedFlow <notifications@mail.schedflow.com>';
  }

  async send(input: SendMailInput): Promise<SendMailResult> {
    const { data, error } = await this.client.emails.send(
      {
        from: this.from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
        replyTo: input.replyTo,
        attachments: input.attachments?.map((file) => ({
          filename: file.filename,
          content: file.content,
          contentType: file.contentType,
        })),
      },
      { idempotencyKey: input.idempotencyKey },
    );

    if (error) {
      const status =
        typeof error === 'object' && error && 'statusCode' in error
          ? Number((error as { statusCode?: number }).statusCode)
          : undefined;
      const message =
        typeof error === 'object' && error && 'message' in error
          ? String((error as { message: string }).message)
          : String(error);
      if (status !== undefined && status >= 400 && status < 500) {
        throw new PermanentMailError(message);
      }
      this.logger.warn(`resend error: ${message}`);
      throw new Error(message);
    }

    return { providerId: data?.id ?? null };
  }
}
