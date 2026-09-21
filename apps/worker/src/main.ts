import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { requestIdMiddleware } from './common/http/request-id.middleware';
import { initTelemetry } from './observability/telemetry';

async function bootstrap() {
  await initTelemetry('worker');
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.use(requestIdMiddleware);
  const config = app.get(ConfigService);
  await app.listen(config.get<number>('WORKER_PORT') ?? 3003);
}

void bootstrap();
