import {
  BadRequestException,
  INestApplication,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/http/all-exceptions.filter';
import { requestIdMiddleware } from './common/http/request-id.middleware';
import { flattenValidationErrors } from './common/http/validation-errors';

export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);
  const appUrl = config.get<string>('APP_URL') ?? 'http://localhost:3000';

  app.setGlobalPrefix('v1', {
    exclude: [
      { path: 'auth/(.*)', method: RequestMethod.ALL },
      { path: 'health', method: RequestMethod.GET },
      { path: 'metrics', method: RequestMethod.ALL },
      { path: '', method: RequestMethod.GET },
    ],
  });

  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || origin === appUrl) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  });
  app.use(requestIdMiddleware);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) =>
        new BadRequestException({
          fieldErrors: flattenValidationErrors(errors),
        }),
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();
}
