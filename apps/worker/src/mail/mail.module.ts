import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggingMailer, Mailer } from './mailer';
import { NotificationDispatcher } from './notification-dispatcher';
import { ResendMailer } from './resend-mailer';

@Module({
  providers: [
    LoggingMailer,
    {
      provide: Mailer,
      inject: [ConfigService, LoggingMailer],
      useFactory: (config: ConfigService, logging: LoggingMailer): Mailer => {
        const apiKey = config.get<string>('RESEND_API_KEY')?.trim();
        if (!apiKey) {
          return logging;
        }
        return new ResendMailer(config);
      },
    },
    NotificationDispatcher,
  ],
  exports: [Mailer, NotificationDispatcher, LoggingMailer],
})
export class MailModule {}
