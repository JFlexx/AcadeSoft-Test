import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { bootstrapTestApp } from './setup-e2e';

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await bootstrapTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('liveness: /health is public and ok', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body.status).toBe('ok');
  });

  it('readiness: /health/ready checks the database', async () => {
    const res = await request(app.getHttpServer()).get('/health/ready').expect(200);
    expect(res.body).toEqual({ status: 'ok', db: 'ok' });
  });
});
