// Throttling is globally disabled for the rest of the e2e suite (those tests
// hammer /auth/login). This spec re-enables it *before* the Nest app is
// created so the ThrottlerModule factory picks up the live limits, then proves
// the auth endpoints actually return 429 once their per-IP budget is spent.
process.env.THROTTLE_DISABLED = 'false';

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapTestApp, resetDb, seedTenant, SeededTenant } from './setup-e2e';

describe('Rate limiting (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let acme: SeededTenant;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapTestApp());
  });

  afterAll(async () => {
    await app.close();
    // Leave the flag as the rest of the suite expects it.
    process.env.THROTTLE_DISABLED = 'true';
  });

  beforeEach(async () => {
    await resetDb(prisma);
    acme = await seedTenant(prisma, {
      slug: 'acme',
      email: 'admin@acme.local',
      password: 'TestPassword123!',
    });
  });

  function http() {
    return request(app.getHttpServer());
  }

  it('throttles /auth/login to 5 attempts per minute (6th → 429)', async () => {
    const payload = {
      tenantSlug: acme.tenantSlug,
      email: acme.adminEmail,
      password: 'WrongPassword!', // 401 still counts toward the limit
    };

    // First 5 are processed (and rejected with 401 for the bad password).
    for (let i = 0; i < 5; i++) {
      await http().post('/auth/login').send(payload).expect(401);
    }
    // 6th within the window is blocked by the throttler.
    await http().post('/auth/login').send(payload).expect(429);
  });

  it('throttles /auth/signup to 3 per hour (4th → 429)', async () => {
    const base = {
      tenantName: 'Academy',
      firstName: 'Jane',
      lastName: 'Owner',
      password: 'StrongPass123!',
    };

    for (let i = 0; i < 3; i++) {
      await http()
        .post('/auth/signup')
        .send({
          ...base,
          tenantSlug: `academy-${i}`,
          email: `jane${i}@academy.local`,
        })
        .expect(201);
    }
    // 4th within the hour is blocked, regardless of payload validity.
    await http()
      .post('/auth/signup')
      .send({
        ...base,
        tenantSlug: 'academy-3',
        email: 'jane3@academy.local',
      })
      .expect(429);
  });
});
