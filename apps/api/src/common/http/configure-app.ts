import {
  INestApplication,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { requestIdMiddleware } from './request-id.middleware';
import { createValidationException } from './validation';

export const GLOBAL_PREFIX = 'v1';

export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);
  const appUrl = config.get<string>('APP_URL') ?? 'http://localhost:3000';

  app.setGlobalPrefix(GLOBAL_PREFIX, {
    exclude: [
      { path: 'health', method: RequestMethod.ALL },
      { path: 'metrics', method: RequestMethod.ALL },
      { path: 'auth', method: RequestMethod.ALL },
      { path: 'auth/(.*)', method: RequestMethod.ALL },
    ],
  });

  app.use(helmet());
  app.enableCors({
    origin: appUrl,
    credentials: true,
  });
  app.use(requestIdMiddleware);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: createValidationException,
    }),
  );
  app.enableShutdownHooks();
}
