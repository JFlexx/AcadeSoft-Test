import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapTestApp, resetDb, seedTenant, SeededTenant } from './setup-e2e';

describe('Attendance (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let acme: SeededTenant;
  let acmeToken: string;
  let acmeSessionId: string;
  let s1: string;
  let s2: string;
  let s3: string;

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
    const group = await prisma.group.create({
      data: { tenantId: acme.tenantId, courseId: course.id, name: 'Group A' },
    });
    const session = await prisma.session.create({
      data: {
        tenantId: acme.tenantId,
        groupId: group.id,
        scheduledAt: new Date('2026-09-01T17:00:00.000Z'),
      },
    });
    acmeSessionId = session.id;

    const [a, b, c] = await Promise.all([
      prisma.student.create({
        data: { tenantId: acme.tenantId, firstName: 'Ana', lastName: 'Uno' },
      }),
      prisma.student.create({
        data: { tenantId: acme.tenantId, firstName: 'Bruno', lastName: 'Dos' },
      }),
      prisma.student.create({
        data: { tenantId: acme.tenantId, firstName: 'Clara', lastName: 'Tres' },
      }),
    ]);
    s1 = a.id;
    s2 = b.id;
    s3 = c.id;
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

  it('bulk-creates attendances for multiple students', async () => {
    const res = await http()
      .post(`/sessions/${acmeSessionId}/attendance`)
      .set(bearer(acmeToken))
      .send({
        items: [
          { studentId: s1, status: 'PRESENT' },
          { studentId: s2, status: 'ABSENT', notes: 'enfermo' },
          { studentId: s3, status: 'LATE' },
        ],
      })
      .expect(201);

    expect(res.body).toHaveLength(3);
    expect(res.body.map((a: { studentId: string }) => a.studentId).sort()).toEqual(
      [s1, s2, s3].sort(),
    );
  });

  it('upserts: re-marking same students replaces their status', async () => {
    await http()
      .post(`/sessions/${acmeSessionId}/attendance`)
      .set(bearer(acmeToken))
      .send({ items: [{ studentId: s1, status: 'PRESENT' }] })
      .expect(201);

    await http()
      .post(`/sessions/${acmeSessionId}/attendance`)
      .set(bearer(acmeToken))
      .send({ items: [{ studentId: s1, status: 'ABSENT', notes: 'no vino' }] })
      .expect(201);

    const list = await http()
      .get(`/sessions/${acmeSessionId}/attendance`)
      .set(bearer(acmeToken))
      .expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({
      studentId: s1,
      status: 'ABSENT',
      notes: 'no vino',
    });
  });

  it('lists, updates a single attendance, and deletes it', async () => {
    await http()
      .post(`/sessions/${acmeSessionId}/attendance`)
      .set(bearer(acmeToken))
      .send({ items: [{ studentId: s1, status: 'PRESENT' }] })
      .expect(201);

    const list = await http()
      .get(`/sessions/${acmeSessionId}/attendance`)
      .set(bearer(acmeToken))
      .expect(200);
    expect(list.body).toHaveLength(1);

    const updated = await http()
      .patch(`/sessions/${acmeSessionId}/attendance/${s1}`)
      .set(bearer(acmeToken))
      .send({ status: 'EXCUSED', notes: 'cita médica' })
      .expect(200);
    expect(updated.body).toMatchObject({ status: 'EXCUSED', notes: 'cita médica' });

    await http()
      .delete(`/sessions/${acmeSessionId}/attendance/${s1}`)
      .set(bearer(acmeToken))
      .expect(204);

    const empty = await http()
      .get(`/sessions/${acmeSessionId}/attendance`)
      .set(bearer(acmeToken))
      .expect(200);
    expect(empty.body).toHaveLength(0);
  });

  it('rejects bulk with duplicate studentId in items (400)', async () => {
    await http()
      .post(`/sessions/${acmeSessionId}/attendance`)
      .set(bearer(acmeToken))
      .send({
        items: [
          { studentId: s1, status: 'PRESENT' },
          { studentId: s1, status: 'ABSENT' },
        ],
      })
      .expect(400);
  });

  it('returns 404 when sessionId is from another tenant', async () => {
    const beta = await seedTenant(prisma, {
      slug: 'beta',
      email: 'admin@beta.local',
      password: 'TestPassword123!',
    });
    const betaCourse = await prisma.course.create({
      data: { tenantId: beta.tenantId, name: 'Beta Course' },
    });
    const betaGroup = await prisma.group.create({
      data: { tenantId: beta.tenantId, courseId: betaCourse.id, name: 'Beta' },
    });
    const betaSession = await prisma.session.create({
      data: {
        tenantId: beta.tenantId,
        groupId: betaGroup.id,
        scheduledAt: new Date('2026-09-02T10:00:00.000Z'),
      },
    });

    await http()
      .post(`/sessions/${betaSession.id}/attendance`)
      .set(bearer(acmeToken))
      .send({ items: [{ studentId: s1, status: 'PRESENT' }] })
      .expect(404);

    await http()
      .get(`/sessions/${betaSession.id}/attendance`)
      .set(bearer(acmeToken))
      .expect(404);
  });

  it('rejects bulk with studentId from another tenant (400)', async () => {
    const beta = await seedTenant(prisma, {
      slug: 'beta',
      email: 'admin@beta.local',
      password: 'TestPassword123!',
    });
    const betaStudent = await prisma.student.create({
      data: { tenantId: beta.tenantId, firstName: 'X', lastName: 'Y' },
    });

    await http()
      .post(`/sessions/${acmeSessionId}/attendance`)
      .set(bearer(acmeToken))
      .send({
        items: [
          { studentId: s1, status: 'PRESENT' },
          { studentId: betaStudent.id, status: 'PRESENT' },
        ],
      })
      .expect(400);

    // ninguna se debe haber creado (transacción)
    expect(await prisma.attendance.count()).toBe(0);
  });

  it('cascades attendance delete when session is deleted', async () => {
    await http()
      .post(`/sessions/${acmeSessionId}/attendance`)
      .set(bearer(acmeToken))
      .send({ items: [{ studentId: s1, status: 'PRESENT' }] })
      .expect(201);

    await http()
      .delete(`/sessions/${acmeSessionId}`)
      .set(bearer(acmeToken))
      .expect(204);

    expect(await prisma.attendance.count()).toBe(0);
  });

  it('rejects PATCH/DELETE on non-existent (sessionId, studentId) with 404', async () => {
    await http()
      .patch(`/sessions/${acmeSessionId}/attendance/${s1}`)
      .set(bearer(acmeToken))
      .send({ status: 'PRESENT' })
      .expect(404);

    await http()
      .delete(`/sessions/${acmeSessionId}/attendance/${s1}`)
      .set(bearer(acmeToken))
      .expect(404);
  });

  it('rejects requests without bearer with 401', async () => {
    await http().get(`/sessions/${acmeSessionId}/attendance`).expect(401);
  });

  it('rejects empty items array with 400', async () => {
    await http()
      .post(`/sessions/${acmeSessionId}/attendance`)
      .set(bearer(acmeToken))
      .send({ items: [] })
      .expect(400);
  });

  it('rejects invalid status enum with 400', async () => {
    await http()
      .post(`/sessions/${acmeSessionId}/attendance`)
      .set(bearer(acmeToken))
      .send({ items: [{ studentId: s1, status: 'NOT_A_STATUS' }] })
      .expect(400);
  });
});
