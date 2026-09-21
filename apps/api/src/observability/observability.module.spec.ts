import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { ObservabilityModule } from './observability.module';

describe('ObservabilityModule metrics', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ObservabilityModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /metrics includes http_request_duration_seconds', async () => {
    const response = await request(app.getHttpServer()).get('/metrics').expect(200);
    expect(response.text).toContain('http_request_duration_seconds');
    expect(response.text).toContain('http_requests_total');
  });
});
