// Card payments are optional: without Stripe keys the API must still boot,
// and the Stripe endpoints must fail cleanly. The real SDK is used here (no
// jest.mock) because it is the SDK itself that throws on an empty key.
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';

describe('Stripe not configured (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const saved = {
    key: process.env.STRIPE_SECRET_KEY,
    webhook: process.env.STRIPE_WEBHOOK_SECRET,
  };

  beforeAll(async () => {
    // Empty (not deleted) so a local apps/api/.env cannot fill them back in.
    process.env.STRIPE_SECRET_KEY = '';
    process.env.STRIPE_WEBHOOK_SECRET = '';
    // Required after the env change: ConfigModule reads it on import.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { bootstrapTestApp, resetDb } = require('./setup-e2e');
    ({ app, prisma } = await bootstrapTestApp());
    await resetDb(prisma);
  });

  afterAll(async () => {
    await app?.close();
    process.env.STRIPE_SECRET_KEY = saved.key;
    process.env.STRIPE_WEBHOOK_SECRET = saved.webhook;
  });

  it('the API boots and is ready', async () => {
    await request(app.getHttpServer()).get('/health/ready').expect(200);
  });

  it('the webhook answers 400 instead of crashing', async () => {
    const res = await request(app.getHttpServer())
      .post('/stripe/webhook')
      .set('stripe-signature', 't=1,v1=abc')
      .set('Content-Type', 'application/json')
      .send('{}')
      .expect(400);
    expect(res.body.message).toMatch(/no están configurados/);
  });
});
