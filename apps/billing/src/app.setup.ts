import {
  INestApplication,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/http/all-exceptions.filter';
import { requestIdMiddleware } from './common/http/request-id.middleware';
import { createValidationException } from './common/http/validation';

export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);
  const appUrl = config.get<string>('APP_URL') ?? 'http://localhost:3000';

  app.setGlobalPrefix('v1', {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'metrics', method: RequestMethod.ALL },
      { path: 'webhooks/(.*)', method: RequestMethod.ALL },
      { path: 'internal/(.*)', method: RequestMethod.ALL },
    ],
  });

  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );
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
  app.useGlobalFilters(new AllExceptionsFilter());
}
