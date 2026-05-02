import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapTestApp, resetDb, seedTenant, SeededTenant } from './setup-e2e';

describe('Sessions (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let acme: SeededTenant;
  let acmeToken: string;
  let acmeGroupId: string;
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
    const teacher = await prisma.teacher.create({
      data: { tenantId: acme.tenantId, firstName: 'Marta', lastName: 'López' },
    });
    acmeTeacherId = teacher.id;
    const group = await prisma.group.create({
      data: { tenantId: acme.tenantId, courseId: course.id, name: 'Group A' },
    });
    acmeGroupId = group.id;
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

  it('creates a session with default SCHEDULED status', async () => {
    const created = await http()
      .post('/sessions')
      .set(bearer(acmeToken))
      .send({
        groupId: acmeGroupId,
        scheduledAt: '2026-09-01T17:00:00.000Z',
      })
      .expect(201);

    expect(created.body).toMatchObject({
      groupId: acmeGroupId,
      teacherId: null,
      status: 'SCHEDULED',
      tenantId: acme.tenantId,
    });
    expect(new Date(created.body.scheduledAt).toISOString()).toBe('2026-09-01T17:00:00.000Z');
  });

  it('creates with teacher and updates status/timestamps', async () => {
    const created = await http()
      .post('/sessions')
      .set(bearer(acmeToken))
      .send({
        groupId: acmeGroupId,
        teacherId: acmeTeacherId,
        scheduledAt: '2026-09-01T17:00:00.000Z',
        notes: 'Tema 1',
      })
      .expect(201);

    const updated = await http()
      .patch(`/sessions/${created.body.id}`)
      .set(bearer(acmeToken))
      .send({
        status: 'COMPLETED',
        startedAt: '2026-09-01T17:05:00.000Z',
        endedAt: '2026-09-01T18:00:00.000Z',
      })
      .expect(200);
    expect(updated.body.status).toBe('COMPLETED');
    expect(updated.body.startedAt).not.toBeNull();
    expect(updated.body.endedAt).not.toBeNull();
  });

  it('lists, fetches, and deletes a session', async () => {
    const created = await http()
      .post('/sessions')
      .set(bearer(acmeToken))
      .send({ groupId: acmeGroupId, scheduledAt: '2026-09-01T17:00:00.000Z' })
      .expect(201);

    const list = await http().get('/sessions').set(bearer(acmeToken)).expect(200);
    expect(list.body).toHaveLength(1);

    await http().get(`/sessions/${created.body.id}`).set(bearer(acmeToken)).expect(200);
    await http().delete(`/sessions/${created.body.id}`).set(bearer(acmeToken)).expect(204);
    await http().get(`/sessions/${created.body.id}`).set(bearer(acmeToken)).expect(404);
  });

  it('filters by groupId, status and date range', async () => {
    const otherGroup = await prisma.group.create({
      data: {
        tenantId: acme.tenantId,
        courseId: (await prisma.course.findFirst({ where: { tenantId: acme.tenantId } }))!.id,
        name: 'Other',
      },
    });

    await http()
      .post('/sessions')
      .set(bearer(acmeToken))
      .send({ groupId: acmeGroupId, scheduledAt: '2026-09-01T10:00:00.000Z' })
      .expect(201);
    await http()
      .post('/sessions')
      .set(bearer(acmeToken))
      .send({ groupId: acmeGroupId, scheduledAt: '2026-09-15T10:00:00.000Z' })
      .expect(201);
    await http()
      .post('/sessions')
      .set(bearer(acmeToken))
      .send({ groupId: otherGroup.id, scheduledAt: '2026-09-10T10:00:00.000Z' })
      .expect(201);

    const byGroup = await http()
      .get(`/sessions?groupId=${acmeGroupId}`)
      .set(bearer(acmeToken))
      .expect(200);
    expect(byGroup.body).toHaveLength(2);

    const byRange = await http()
      .get('/sessions?from=2026-09-05T00:00:00.000Z&to=2026-09-12T00:00:00.000Z')
      .set(bearer(acmeToken))
      .expect(200);
    expect(byRange.body).toHaveLength(1);
    expect(byRange.body[0].groupId).toBe(otherGroup.id);

    const ordered = await http().get('/sessions').set(bearer(acmeToken)).expect(200);
    expect(ordered.body.map((s: { scheduledAt: string }) => s.scheduledAt.slice(0, 10))).toEqual([
      '2026-09-01',
      '2026-09-10',
      '2026-09-15',
    ]);
  });

  describe('cross-tenant FK protection', () => {
    let beta: SeededTenant;
    let betaGroupId: string;
    let betaTeacherId: string;

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
      const betaTeacher = await prisma.teacher.create({
        data: { tenantId: beta.tenantId, firstName: 'B', lastName: 'B' },
      });
      betaGroupId = betaGroup.id;
      betaTeacherId = betaTeacher.id;
    });

    it('rejects session with groupId from another tenant (400)', async () => {
      const res = await http()
        .post('/sessions')
        .set(bearer(acmeToken))
        .send({ groupId: betaGroupId, scheduledAt: '2026-09-01T10:00:00.000Z' })
        .expect(400);
      expect(res.body.message).toMatch(/group/i);
    });

    it('rejects session with teacherId from another tenant (400)', async () => {
      const res = await http()
        .post('/sessions')
        .set(bearer(acmeToken))
        .send({
          groupId: acmeGroupId,
          teacherId: betaTeacherId,
          scheduledAt: '2026-09-01T10:00:00.000Z',
        })
        .expect(400);
      expect(res.body.message).toMatch(/teacher/i);
    });

    it('isolates listing between tenants', async () => {
      const betaToken = await login(beta);
      await http()
        .post('/sessions')
        .set(bearer(acmeToken))
        .send({ groupId: acmeGroupId, scheduledAt: '2026-09-01T10:00:00.000Z' })
        .expect(201);
      await http()
        .post('/sessions')
        .set(bearer(betaToken))
        .send({ groupId: betaGroupId, scheduledAt: '2026-09-02T10:00:00.000Z' })
        .expect(201);

      const acmeList = await http().get('/sessions').set(bearer(acmeToken)).expect(200);
      expect(acmeList.body).toHaveLength(1);
      expect(acmeList.body[0].groupId).toBe(acmeGroupId);
    });
  });

  it('rejects requests without bearer with 401', async () => {
    await http().get('/sessions').expect(401);
  });

  it('rejects malformed scheduledAt with 400', async () => {
    await http()
      .post('/sessions')
      .set(bearer(acmeToken))
      .send({ groupId: acmeGroupId, scheduledAt: 'not-a-date' })
      .expect(400);
  });

  it('rejects extra fields with 400', async () => {
    await http()
      .post('/sessions')
      .set(bearer(acmeToken))
      .send({
        groupId: acmeGroupId,
        scheduledAt: '2026-09-01T10:00:00.000Z',
        evilExtra: true,
      })
      .expect(400);
  });
});
