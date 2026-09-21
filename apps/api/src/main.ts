import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { initTelemetry } from './observability/telemetry';

async function bootstrap() {
  await initTelemetry('api');
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureApp(app);
  const config = app.get(ConfigService);
  await app.listen(config.get<number>('PORT') ?? 3001);
}
void bootstrap();
