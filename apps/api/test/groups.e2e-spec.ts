import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapTestApp, resetDb, seedTenant, SeededTenant } from './setup-e2e';

describe('Groups (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let acme: SeededTenant;
  let acmeToken: string;
  let acmeCourseId: string;
  let acmeTeacherId: string;

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

    const course = await prisma.course.create({
      data: { tenantId: acme.tenantId, name: 'Mates' },
    });
    acmeCourseId = course.id;

    const teacher = await prisma.teacher.create({
      data: { tenantId: acme.tenantId, firstName: 'Marta', lastName: 'López' },
    });
    acmeTeacherId = teacher.id;
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

  it('creates a group with course only (no teacher)', async () => {
    const created = await http()
      .post('/groups')
      .set(bearer(acmeToken))
      .send({ courseId: acmeCourseId, name: 'Group A' })
      .expect(201);

    expect(created.body).toMatchObject({
      courseId: acmeCourseId,
      teacherId: null,
      name: 'Group A',
      isActive: true,
      tenantId: acme.tenantId,
    });
  });

  it('creates a group with teacher and full payload', async () => {
    const created = await http()
      .post('/groups')
      .set(bearer(acmeToken))
      .send({
        courseId: acmeCourseId,
        teacherId: acmeTeacherId,
        name: 'Group B',
        description: 'Tarde',
        schedule: { monday: '17:00-19:00', wednesday: '17:00-19:00' },
        startDate: '2026-09-01',
        endDate: '2027-06-30',
        maxCapacity: 20,
      })
      .expect(201);

    expect(created.body).toMatchObject({
      teacherId: acmeTeacherId,
      maxCapacity: 20,
      schedule: { monday: '17:00-19:00', wednesday: '17:00-19:00' },
    });
  });

  it('lists, fetches, updates and deletes a group', async () => {
    const created = await http()
      .post('/groups')
      .set(bearer(acmeToken))
      .send({ courseId: acmeCourseId, name: 'Group A' })
      .expect(201);
    const groupId = created.body.id;

    const list = await http().get('/groups').set(bearer(acmeToken)).expect(200);
    expect(list.body).toHaveLength(1);

    await http().get(`/groups/${groupId}`).set(bearer(acmeToken)).expect(200);

    const updated = await http()
      .patch(`/groups/${groupId}`)
      .set(bearer(acmeToken))
      .send({ name: 'Group A (mañana)', maxCapacity: 15, isActive: false })
      .expect(200);
    expect(updated.body).toMatchObject({
      name: 'Group A (mañana)',
      maxCapacity: 15,
      isActive: false,
    });

    await http().delete(`/groups/${groupId}`).set(bearer(acmeToken)).expect(204);
    await http().get(`/groups/${groupId}`).set(bearer(acmeToken)).expect(404);
  });

  describe('cross-tenant FK protection', () => {
    let beta: SeededTenant;
    let betaToken: string;
    let betaCourseId: string;
    let betaTeacherId: string;

    beforeEach(async () => {
      beta = await seedTenant(prisma, {
        slug: 'beta',
        email: 'admin@beta.local',
        password: 'TestPassword123!',
      });
      betaToken = await login(beta);
      const course = await prisma.course.create({
        data: { tenantId: beta.tenantId, name: 'Beta Course' },
      });
      betaCourseId = course.id;
      const teacher = await prisma.teacher.create({
        data: { tenantId: beta.tenantId, firstName: 'Beta', lastName: 'Teacher' },
      });
      betaTeacherId = teacher.id;
    });

    it('rejects creating a group with courseId from another tenant (400)', async () => {
      const res = await http()
        .post('/groups')
        .set(bearer(acmeToken))
        .send({ courseId: betaCourseId, name: 'Stolen' })
        .expect(400);
      expect(res.body.message).toMatch(/course/i);
    });

    it('rejects creating a group with teacherId from another tenant (400)', async () => {
      const res = await http()
        .post('/groups')
        .set(bearer(acmeToken))
        .send({ courseId: acmeCourseId, teacherId: betaTeacherId, name: 'Mixed' })
        .expect(400);
      expect(res.body.message).toMatch(/teacher/i);
    });

    it('rejects updating a group to point to another tenant course (400)', async () => {
      const created = await http()
        .post('/groups')
        .set(bearer(acmeToken))
        .send({ courseId: acmeCourseId, name: 'A' })
        .expect(201);

      await http()
        .patch(`/groups/${created.body.id}`)
        .set(bearer(acmeToken))
        .send({ courseId: betaCourseId })
        .expect(400);
    });

    it('isolates listing and fetch between tenants', async () => {
      const acmeGroup = await http()
        .post('/groups')
        .set(bearer(acmeToken))
        .send({ courseId: acmeCourseId, name: 'Acme Group' })
        .expect(201);

      await http()
        .post('/groups')
        .set(bearer(betaToken))
        .send({ courseId: betaCourseId, name: 'Beta Group' })
        .expect(201);

      const acmeList = await http().get('/groups').set(bearer(acmeToken)).expect(200);
      expect(acmeList.body.map((g: { name: string }) => g.name)).toEqual(['Acme Group']);

      await http()
        .get(`/groups/${acmeGroup.body.id}`)
        .set(bearer(betaToken))
        .expect(404);
    });
  });

  it('cascades delete to enrollments and sessions (DB-level)', async () => {
    const group = await prisma.group.create({
      data: { tenantId: acme.tenantId, courseId: acmeCourseId, name: 'G' },
    });
    const student = await prisma.student.create({
      data: { tenantId: acme.tenantId, firstName: 'A', lastName: 'B' },
    });
    await prisma.enrollment.create({
      data: { studentId: student.id, groupId: group.id },
    });
    await prisma.session.create({
      data: { tenantId: acme.tenantId, groupId: group.id, scheduledAt: new Date() },
    });

    await http().delete(`/groups/${group.id}`).set(bearer(acmeToken)).expect(204);

    expect(await prisma.enrollment.count()).toBe(0);
    expect(await prisma.session.count()).toBe(0);
  });

  it('rejects requests without bearer with 401', async () => {
    await http().get('/groups').expect(401);
  });

  it('rejects extra fields with 400', async () => {
    await http()
      .post('/groups')
      .set(bearer(acmeToken))
      .send({ courseId: acmeCourseId, name: 'A', evilExtra: true })
      .expect(400);
  });

  it('rejects maxCapacity below 1 with 400', async () => {
    await http()
      .post('/groups')
      .set(bearer(acmeToken))
      .send({ courseId: acmeCourseId, name: 'A', maxCapacity: 0 })
      .expect(400);
  });
});
