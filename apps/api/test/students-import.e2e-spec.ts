import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapTestApp, resetDb, seedTenant, SeededTenant } from './setup-e2e';

describe('Students bulk import (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let acme: SeededTenant;
  let token: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    acme = await seedTenant(prisma, {
      slug: 'acme',
      email: 'admin@acme.local',
      password: 'TestPassword123!',
    });
    token = await login(acme);
  });

  function http() {
    return request(app.getHttpServer());
  }

  async function login(t: SeededTenant): Promise<string> {
    const res = await http()
      .post('/auth/login')
      .send({ tenantSlug: t.tenantSlug, email: t.adminEmail, password: t.adminPassword })
      .expect(200);
    return res.body.accessToken;
  }

  function bearer(t: string) {
    return { Authorization: `Bearer ${t}` };
  }

  it('imports several students and they appear in the list', async () => {
    const res = await http()
      .post('/students/import')
      .set(bearer(token))
      .send({
        students: [
          { firstName: 'Ana', lastName: 'García', email: 'ana@example.com' },
          { firstName: 'Beto', lastName: 'López', phone: '600111222' },
          { firstName: 'Noa', lastName: 'Vidal', discountPercent: 10 },
        ],
      })
      .expect(201);

    expect(res.body).toMatchObject({ total: 3, created: 3, failed: 0 });
    expect(res.body.errors).toHaveLength(0);

    const list = await http().get('/students').set(bearer(token)).expect(200);
    expect(list.body).toHaveLength(3);
    const noa = list.body.find((s: { firstName: string }) => s.firstName === 'Noa');
    expect(Number(noa.discountPercent)).toBe(10);
  });

  it('rejects a batch with a structurally invalid row (400)', async () => {
    await http()
      .post('/students/import')
      .set(bearer(token))
      .send({
        students: [
          { firstName: 'Ana', lastName: 'García' },
          { firstName: 'NoLastName' }, // missing required lastName
        ],
      })
      .expect(400);

    // nothing persisted
    const list = await http().get('/students').set(bearer(token)).expect(200);
    expect(list.body).toHaveLength(0);
  });

  it('rejects an empty array and a non-array (400)', async () => {
    await http()
      .post('/students/import')
      .set(bearer(token))
      .send({ students: [] })
      .expect(400);

    await http()
      .post('/students/import')
      .set(bearer(token))
      .send({ students: 'nope' })
      .expect(400);
  });

  it('rejects unknown fields in a row (whitelist)', async () => {
    await http()
      .post('/students/import')
      .set(bearer(token))
      .send({
        students: [{ firstName: 'Ana', lastName: 'García', role: 'admin' }],
      })
      .expect(400);
  });

  it('imports are scoped to the caller tenant', async () => {
    await http()
      .post('/students/import')
      .set(bearer(token))
      .send({ students: [{ firstName: 'Ana', lastName: 'García' }] })
      .expect(201);

    const beta = await seedTenant(prisma, {
      slug: 'beta',
      email: 'admin@beta.local',
      password: 'TestPassword123!',
    });
    const betaToken = await login(beta);

    const betaList = await http()
      .get('/students')
      .set(bearer(betaToken))
      .expect(200);
    expect(betaList.body).toHaveLength(0);
  });

  it('requires authentication (401)', async () => {
    await http()
      .post('/students/import')
      .send({ students: [{ firstName: 'Ana', lastName: 'García' }] })
      .expect(401);
  });
});
