import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapTestApp, resetDb, seedTenant, SeededTenant } from './setup-e2e';

describe('Students (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let acme: SeededTenant;
  let acmeToken: string;

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
    acmeToken = await login(acme);
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

  function bearer(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  it('creates, lists, fetches, updates and deletes a student', async () => {
    const created = await http()
      .post('/students')
      .set(bearer(acmeToken))
      .send({
        firstName: 'Ana',
        lastName: 'García',
        email: 'ana@example.com',
        birthDate: '2010-04-15',
        gender: 'FEMALE',
      })
      .expect(201);

    expect(created.body).toMatchObject({
      firstName: 'Ana',
      lastName: 'García',
      email: 'ana@example.com',
      gender: 'FEMALE',
      isActive: true,
      tenantId: acme.tenantId,
    });
    const studentId = created.body.id;

    const list = await http().get('/students').set(bearer(acmeToken)).expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(studentId);

    const fetched = await http()
      .get(`/students/${studentId}`)
      .set(bearer(acmeToken))
      .expect(200);
    expect(fetched.body.id).toBe(studentId);

    const updated = await http()
      .patch(`/students/${studentId}`)
      .set(bearer(acmeToken))
      .send({ phone: '+34 600 111 222', isActive: false })
      .expect(200);
    expect(updated.body).toMatchObject({
      phone: '+34 600 111 222',
      isActive: false,
    });

    await http().delete(`/students/${studentId}`).set(bearer(acmeToken)).expect(204);
    await http().get(`/students/${studentId}`).set(bearer(acmeToken)).expect(404);
  });

  it('isolates students between tenants', async () => {
    const beta = await seedTenant(prisma, {
      slug: 'beta',
      email: 'admin@beta.local',
      password: 'TestPassword123!',
    });
    const betaToken = await login(beta);

    const acmeStudent = await http()
      .post('/students')
      .set(bearer(acmeToken))
      .send({ firstName: 'Ana', lastName: 'Acme' })
      .expect(201);

    await http()
      .post('/students')
      .set(bearer(betaToken))
      .send({ firstName: 'Bruno', lastName: 'Beta' })
      .expect(201);

    const acmeList = await http().get('/students').set(bearer(acmeToken)).expect(200);
    expect(acmeList.body).toHaveLength(1);
    expect(acmeList.body[0].lastName).toBe('Acme');

    const betaList = await http().get('/students').set(bearer(betaToken)).expect(200);
    expect(betaList.body).toHaveLength(1);
    expect(betaList.body[0].lastName).toBe('Beta');

    await http()
      .get(`/students/${acmeStudent.body.id}`)
      .set(bearer(betaToken))
      .expect(404);

    await http()
      .patch(`/students/${acmeStudent.body.id}`)
      .set(bearer(betaToken))
      .send({ firstName: 'Hacked' })
      .expect(404);

    await http()
      .delete(`/students/${acmeStudent.body.id}`)
      .set(bearer(betaToken))
      .expect(404);
  });

  it('rejects requests without bearer with 401', async () => {
    await http().get('/students').expect(401);
    await http().post('/students').send({ firstName: 'X', lastName: 'Y' }).expect(401);
  });

  it('rejects extra fields in body with 400', async () => {
    await http()
      .post('/students')
      .set(bearer(acmeToken))
      .send({ firstName: 'Ana', lastName: 'García', extraEvil: true })
      .expect(400);
  });

  it('rejects malformed birthDate with 400', async () => {
    await http()
      .post('/students')
      .set(bearer(acmeToken))
      .send({ firstName: 'Ana', lastName: 'García', birthDate: 'not-a-date' })
      .expect(400);
  });
});
