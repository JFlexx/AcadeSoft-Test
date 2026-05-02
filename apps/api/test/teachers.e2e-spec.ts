import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapTestApp, resetDb, seedTenant, SeededTenant } from './setup-e2e';

describe('Teachers (e2e)', () => {
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

  it('creates, lists, fetches, updates and deletes a teacher', async () => {
    const created = await http()
      .post('/teachers')
      .set(bearer(acmeToken))
      .send({
        firstName: 'Marta',
        lastName: 'López',
        email: 'marta@example.com',
        bio: 'Profesora de matemáticas',
      })
      .expect(201);

    expect(created.body).toMatchObject({
      firstName: 'Marta',
      lastName: 'López',
      email: 'marta@example.com',
      bio: 'Profesora de matemáticas',
      isActive: true,
      tenantId: acme.tenantId,
    });
    const teacherId = created.body.id;

    const list = await http().get('/teachers').set(bearer(acmeToken)).expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(teacherId);

    await http().get(`/teachers/${teacherId}`).set(bearer(acmeToken)).expect(200);

    const updated = await http()
      .patch(`/teachers/${teacherId}`)
      .set(bearer(acmeToken))
      .send({ phone: '+34 600 999 888', isActive: false })
      .expect(200);
    expect(updated.body).toMatchObject({
      phone: '+34 600 999 888',
      isActive: false,
    });

    await http().delete(`/teachers/${teacherId}`).set(bearer(acmeToken)).expect(204);
    await http().get(`/teachers/${teacherId}`).set(bearer(acmeToken)).expect(404);
  });

  it('isolates teachers between tenants', async () => {
    const beta = await seedTenant(prisma, {
      slug: 'beta',
      email: 'admin@beta.local',
      password: 'TestPassword123!',
    });
    const betaToken = await login(beta);

    const acmeTeacher = await http()
      .post('/teachers')
      .set(bearer(acmeToken))
      .send({ firstName: 'Marta', lastName: 'Acme' })
      .expect(201);

    await http()
      .post('/teachers')
      .set(bearer(betaToken))
      .send({ firstName: 'Pedro', lastName: 'Beta' })
      .expect(201);

    const acmeList = await http().get('/teachers').set(bearer(acmeToken)).expect(200);
    expect(acmeList.body).toHaveLength(1);
    expect(acmeList.body[0].lastName).toBe('Acme');

    const betaList = await http().get('/teachers').set(bearer(betaToken)).expect(200);
    expect(betaList.body).toHaveLength(1);
    expect(betaList.body[0].lastName).toBe('Beta');

    await http()
      .get(`/teachers/${acmeTeacher.body.id}`)
      .set(bearer(betaToken))
      .expect(404);

    await http()
      .patch(`/teachers/${acmeTeacher.body.id}`)
      .set(bearer(betaToken))
      .send({ firstName: 'Hacked' })
      .expect(404);

    await http()
      .delete(`/teachers/${acmeTeacher.body.id}`)
      .set(bearer(betaToken))
      .expect(404);
  });

  it('rejects requests without bearer with 401', async () => {
    await http().get('/teachers').expect(401);
    await http().post('/teachers').send({ firstName: 'X', lastName: 'Y' }).expect(401);
  });

  it('rejects extra fields with 400', async () => {
    await http()
      .post('/teachers')
      .set(bearer(acmeToken))
      .send({ firstName: 'Marta', lastName: 'López', extraEvil: true })
      .expect(400);
  });

  it('rejects malformed email with 400', async () => {
    await http()
      .post('/teachers')
      .set(bearer(acmeToken))
      .send({ firstName: 'Marta', lastName: 'López', email: 'not-an-email' })
      .expect(400);
  });
});
