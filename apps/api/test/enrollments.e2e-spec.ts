import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapTestApp, resetDb, seedTenant, SeededTenant } from './setup-e2e';

describe('Enrollments (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let acme: SeededTenant;
  let acmeToken: string;
  let acmeStudentId: string;
  let acmeStudent2Id: string;
  let acmeGroupId: string;
  let acmeGroup2Id: string;

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
    const [g1, g2] = await Promise.all([
      prisma.group.create({
        data: { tenantId: acme.tenantId, courseId: course.id, name: 'Group A' },
      }),
      prisma.group.create({
        data: { tenantId: acme.tenantId, courseId: course.id, name: 'Group B' },
      }),
    ]);
    acmeGroupId = g1.id;
    acmeGroup2Id = g2.id;

    const [s1, s2] = await Promise.all([
      prisma.student.create({
        data: { tenantId: acme.tenantId, firstName: 'Ana', lastName: 'Uno' },
      }),
      prisma.student.create({
        data: { tenantId: acme.tenantId, firstName: 'Bruno', lastName: 'Dos' },
      }),
    ]);
    acmeStudentId = s1.id;
    acmeStudent2Id = s2.id;
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

  it('creates an enrollment with default ACTIVE status', async () => {
    const created = await http()
      .post('/enrollments')
      .set(bearer(acmeToken))
      .send({ studentId: acmeStudentId, groupId: acmeGroupId })
      .expect(201);

    expect(created.body).toMatchObject({
      studentId: acmeStudentId,
      groupId: acmeGroupId,
      status: 'ACTIVE',
      droppedAt: null,
    });
    expect(created.body.enrolledAt).toEqual(expect.any(String));
  });

  it('lists, fetches, updates and deletes an enrollment', async () => {
    const created = await http()
      .post('/enrollments')
      .set(bearer(acmeToken))
      .send({ studentId: acmeStudentId, groupId: acmeGroupId, notes: 'Trial' })
      .expect(201);
    const enrollmentId = created.body.id;

    const list = await http().get('/enrollments').set(bearer(acmeToken)).expect(200);
    expect(list.body).toHaveLength(1);

    await http().get(`/enrollments/${enrollmentId}`).set(bearer(acmeToken)).expect(200);

    const droppedAt = '2026-06-01T10:00:00.000Z';
    const updated = await http()
      .patch(`/enrollments/${enrollmentId}`)
      .set(bearer(acmeToken))
      .send({ status: 'DROPPED', droppedAt, notes: 'Lost interest' })
      .expect(200);
    expect(updated.body).toMatchObject({
      status: 'DROPPED',
      droppedAt,
      notes: 'Lost interest',
    });

    await http().delete(`/enrollments/${enrollmentId}`).set(bearer(acmeToken)).expect(204);
    await http().get(`/enrollments/${enrollmentId}`).set(bearer(acmeToken)).expect(404);
  });

  it('filters by studentId, groupId and status', async () => {
    await http()
      .post('/enrollments')
      .set(bearer(acmeToken))
      .send({ studentId: acmeStudentId, groupId: acmeGroupId })
      .expect(201);
    await http()
      .post('/enrollments')
      .set(bearer(acmeToken))
      .send({ studentId: acmeStudentId, groupId: acmeGroup2Id, status: 'PENDING' })
      .expect(201);
    await http()
      .post('/enrollments')
      .set(bearer(acmeToken))
      .send({ studentId: acmeStudent2Id, groupId: acmeGroupId })
      .expect(201);

    const byStudent = await http()
      .get(`/enrollments?studentId=${acmeStudentId}`)
      .set(bearer(acmeToken))
      .expect(200);
    expect(byStudent.body).toHaveLength(2);

    const byGroup = await http()
      .get(`/enrollments?groupId=${acmeGroupId}`)
      .set(bearer(acmeToken))
      .expect(200);
    expect(byGroup.body).toHaveLength(2);

    const byStatus = await http()
      .get('/enrollments?status=PENDING')
      .set(bearer(acmeToken))
      .expect(200);
    expect(byStatus.body).toHaveLength(1);
    expect(byStatus.body[0].status).toBe('PENDING');

    const combined = await http()
      .get(`/enrollments?studentId=${acmeStudentId}&groupId=${acmeGroupId}`)
      .set(bearer(acmeToken))
      .expect(200);
    expect(combined.body).toHaveLength(1);
  });

  it('returns 409 on duplicate enrollment (same student + group)', async () => {
    await http()
      .post('/enrollments')
      .set(bearer(acmeToken))
      .send({ studentId: acmeStudentId, groupId: acmeGroupId })
      .expect(201);

    const dup = await http()
      .post('/enrollments')
      .set(bearer(acmeToken))
      .send({ studentId: acmeStudentId, groupId: acmeGroupId })
      .expect(409);
    expect(dup.body.message).toMatch(/already enrolled/i);
  });

  describe('cross-tenant FK protection', () => {
    let beta: SeededTenant;
    let betaStudentId: string;
    let betaGroupId: string;

    beforeEach(async () => {
      beta = await seedTenant(prisma, {
        slug: 'beta',
        email: 'admin@beta.local',
        password: 'TestPassword123!',
      });
      const betaCourse = await prisma.course.create({
        data: { tenantId: beta.tenantId, name: 'Beta Course' },
      });
      const betaGroup = await prisma.group.create({
        data: { tenantId: beta.tenantId, courseId: betaCourse.id, name: 'Beta Group' },
      });
      const betaStudent = await prisma.student.create({
        data: { tenantId: beta.tenantId, firstName: 'B', lastName: 'B' },
      });
      betaGroupId = betaGroup.id;
      betaStudentId = betaStudent.id;
    });

    it('rejects creating enrollment with studentId from another tenant (400)', async () => {
      const res = await http()
        .post('/enrollments')
        .set(bearer(acmeToken))
        .send({ studentId: betaStudentId, groupId: acmeGroupId })
        .expect(400);
      expect(res.body.message).toMatch(/student/i);
    });

    it('rejects creating enrollment with groupId from another tenant (400)', async () => {
      const res = await http()
        .post('/enrollments')
        .set(bearer(acmeToken))
        .send({ studentId: acmeStudentId, groupId: betaGroupId })
        .expect(400);
      expect(res.body.message).toMatch(/group/i);
    });

    it('isolates listing between tenants', async () => {
      const betaToken = await login(beta);
      await prisma.enrollment.create({
        data: { studentId: betaStudentId, groupId: betaGroupId },
      });
      await prisma.enrollment.create({
        data: { studentId: acmeStudentId, groupId: acmeGroupId },
      });

      const acmeList = await http().get('/enrollments').set(bearer(acmeToken)).expect(200);
      expect(acmeList.body).toHaveLength(1);
      expect(acmeList.body[0].studentId).toBe(acmeStudentId);

      const betaList = await http().get('/enrollments').set(bearer(betaToken)).expect(200);
      expect(betaList.body).toHaveLength(1);
      expect(betaList.body[0].studentId).toBe(betaStudentId);
    });
  });

  it('rejects requests without bearer with 401', async () => {
    await http().get('/enrollments').expect(401);
  });

  it('rejects invalid status enum with 400', async () => {
    await http()
      .post('/enrollments')
      .set(bearer(acmeToken))
      .send({ studentId: acmeStudentId, groupId: acmeGroupId, status: 'NOT_A_STATUS' })
      .expect(400);
  });

  it('rejects extra fields with 400', async () => {
    await http()
      .post('/enrollments')
      .set(bearer(acmeToken))
      .send({ studentId: acmeStudentId, groupId: acmeGroupId, evilExtra: true })
      .expect(400);
  });
});
