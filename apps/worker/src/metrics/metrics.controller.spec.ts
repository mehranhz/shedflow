import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { MetricsController } from './metrics.controller';

describe('MetricsController', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [MetricsController],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /metrics is 200 with a stub body', async () => {
    const response = await request(app.getHttpServer()).get('/metrics').expect(200);
    expect(response.body).toEqual({ status: 'stub' });
  });
});
