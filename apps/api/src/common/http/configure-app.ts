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

  // Staff screens call `/v1/auth/me` while NextAuth and OTP stay on `/auth/*`.
  app.use(
    (
      req: { url?: string },
      _res: unknown,
      next: () => void,
    ) => {
      if (req.url?.startsWith('/v1/auth')) {
        req.url = req.url.replace(/^\/v1\/auth/, '/auth');
      }
      next();
    },
  );

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
