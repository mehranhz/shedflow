import { Injectable, Logger } from '@nestjs/common';

export type MailAttachment = {
  filename: string;
  content: Buffer;
  contentType: string;
};

export type SendMailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  idempotencyKey: string;
  attachments?: MailAttachment[];
};

export type SendMailResult = {
  providerId: string | null;
};

export abstract class Mailer {
  abstract send(input: SendMailInput): Promise<SendMailResult>;
}

/** Dev / CI transport: never calls Resend; logs HTML and reports success. */
@Injectable()
export class LoggingMailer extends Mailer {
  private readonly logger = new Logger(LoggingMailer.name);
  readonly sent: SendMailInput[] = [];

  async send(input: SendMailInput): Promise<SendMailResult> {
    this.sent.push(input);
    this.logger.log(
      `email to=${input.to} subject=${JSON.stringify(input.subject)} key=${input.idempotencyKey}`,
    );
    this.logger.debug(`email html=${input.html.slice(0, 500)}`);
    return { providerId: `log:${input.idempotencyKey}` };
  }
}
