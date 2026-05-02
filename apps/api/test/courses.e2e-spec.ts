import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapTestApp, resetDb, seedTenant, SeededTenant } from './setup-e2e';

describe('Courses (e2e)', () => {
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

  it('creates, lists, fetches, updates and deletes a course', async () => {
    const created = await http()
      .post('/courses')
      .set(bearer(acmeToken))
      .send({
        name: 'Matemáticas 1º ESO',
        description: 'Curso introductorio',
        color: '#ff0000',
      })
      .expect(201);

    expect(created.body).toMatchObject({
      name: 'Matemáticas 1º ESO',
      description: 'Curso introductorio',
      color: '#ff0000',
      isActive: true,
      tenantId: acme.tenantId,
    });
    const courseId = created.body.id;

    const list = await http().get('/courses').set(bearer(acmeToken)).expect(200);
    expect(list.body).toHaveLength(1);

    await http().get(`/courses/${courseId}`).set(bearer(acmeToken)).expect(200);

    const updated = await http()
      .patch(`/courses/${courseId}`)
      .set(bearer(acmeToken))
      .send({ name: 'Mates 1º', isActive: false })
      .expect(200);
    expect(updated.body).toMatchObject({ name: 'Mates 1º', isActive: false });

    await http().delete(`/courses/${courseId}`).set(bearer(acmeToken)).expect(204);
    await http().get(`/courses/${courseId}`).set(bearer(acmeToken)).expect(404);
  });

  it('uses default color when none provided', async () => {
    const created = await http()
      .post('/courses')
      .set(bearer(acmeToken))
      .send({ name: 'Lengua' })
      .expect(201);
    expect(created.body.color).toBe('#6366f1');
  });

  it('isolates courses between tenants', async () => {
    const beta = await seedTenant(prisma, {
      slug: 'beta',
      email: 'admin@beta.local',
      password: 'TestPassword123!',
    });
    const betaToken = await login(beta);

    const acmeCourse = await http()
      .post('/courses')
      .set(bearer(acmeToken))
      .send({ name: 'Acme Course' })
      .expect(201);

    await http()
      .post('/courses')
      .set(bearer(betaToken))
      .send({ name: 'Beta Course' })
      .expect(201);

    const acmeList = await http().get('/courses').set(bearer(acmeToken)).expect(200);
    expect(acmeList.body).toHaveLength(1);
    expect(acmeList.body[0].name).toBe('Acme Course');

    await http()
      .get(`/courses/${acmeCourse.body.id}`)
      .set(bearer(betaToken))
      .expect(404);
    await http()
      .patch(`/courses/${acmeCourse.body.id}`)
      .set(bearer(betaToken))
      .send({ name: 'Hacked' })
      .expect(404);
    await http()
      .delete(`/courses/${acmeCourse.body.id}`)
      .set(bearer(betaToken))
      .expect(404);
  });

  it('returns 409 when deleting a course that has groups', async () => {
    const course = await http()
      .post('/courses')
      .set(bearer(acmeToken))
      .send({ name: 'Mates' })
      .expect(201);

    // No hay endpoint /groups todavía — creamos el group directo en BD para probar el conflict.
    await prisma.group.create({
      data: {
        tenantId: acme.tenantId,
        courseId: course.body.id,
        name: 'Group A',
      },
    });

    await http().delete(`/courses/${course.body.id}`).set(bearer(acmeToken)).expect(409);
    // El course sigue existiendo
    await http().get(`/courses/${course.body.id}`).set(bearer(acmeToken)).expect(200);
  });

  it('rejects requests without bearer with 401', async () => {
    await http().get('/courses').expect(401);
    await http().post('/courses').send({ name: 'X' }).expect(401);
  });

  it('rejects invalid color format with 400', async () => {
    await http()
      .post('/courses')
      .set(bearer(acmeToken))
      .send({ name: 'Mates', color: 'red' })
      .expect(400);
  });

  it('rejects extra fields with 400', async () => {
    await http()
      .post('/courses')
      .set(bearer(acmeToken))
      .send({ name: 'Mates', evilExtra: 1 })
      .expect(400);
  });
});
