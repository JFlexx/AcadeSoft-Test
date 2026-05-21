import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapTestApp, resetDb, seedTenant, SeededTenant } from './setup-e2e';

describe('Billing (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let acme: SeededTenant;
  let acmeToken: string;
  let courseId: string;

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
    const course = await http()
      .post('/courses')
      .set(bearer(acmeToken))
      .send({ name: 'Inglés' })
      .expect(201);
    courseId = course.body.id;
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

  async function createStudent(token: string, firstName: string, lastName: string) {
    const res = await http()
      .post('/students')
      .set(bearer(token))
      .send({ firstName, lastName })
      .expect(201);
    return res.body.id as string;
  }

  async function createGroup(
    token: string,
    name: string,
    monthlyFee?: number,
    overrideCourseId?: string,
  ) {
    const payload: Record<string, unknown> = {
      courseId: overrideCourseId ?? courseId,
      name,
    };
    if (monthlyFee !== undefined) payload.monthlyFee = monthlyFee;
    const res = await http()
      .post('/groups')
      .set(bearer(token))
      .send(payload)
      .expect(201);
    return res.body.id as string;
  }

  async function enroll(token: string, studentId: string, groupId: string) {
    const res = await http()
      .post('/enrollments')
      .set(bearer(token))
      .send({ studentId, groupId })
      .expect(201);
    return res.body.id as string;
  }

  it('generates one invoice per active enrollment with the group fee', async () => {
    const groupId = await createGroup(acmeToken, 'Inglés A1', 50);
    const ana = await createStudent(acmeToken, 'Ana', 'García');
    const beto = await createStudent(acmeToken, 'Beto', 'López');
    await enroll(acmeToken, ana, groupId);
    await enroll(acmeToken, beto, groupId);

    const res = await http()
      .post('/billing/generate-month')
      .set(bearer(acmeToken))
      .send({ month: 10, year: 2026 })
      .expect(201);

    expect(res.body.period).toBe('2026-10');
    expect(res.body.dryRun).toBe(false);
    expect(res.body.summary).toMatchObject({
      created: 2,
      skipped: 0,
      noFee: 0,
      total: 2,
    });
    for (const r of res.body.results) {
      expect(r.status).toBe('CREATED');
      expect(Number(r.amount)).toBe(50);
      expect(r.invoiceId).toBeTruthy();
    }

    const list = await http()
      .get('/invoices')
      .set(bearer(acmeToken))
      .expect(200);
    expect(list.body).toHaveLength(2);
    expect(list.body[0].billingPeriod).toBe('2026-10');
    expect(list.body[0].description).toMatch(/Inglés A1 — Octubre 2026/);
  });

  it('is idempotent: re-running for same month marks all as SKIPPED', async () => {
    const groupId = await createGroup(acmeToken, 'Inglés A1', 50);
    const ana = await createStudent(acmeToken, 'Ana', 'García');
    await enroll(acmeToken, ana, groupId);

    await http()
      .post('/billing/generate-month')
      .set(bearer(acmeToken))
      .send({ month: 10, year: 2026 })
      .expect(201);

    const second = await http()
      .post('/billing/generate-month')
      .set(bearer(acmeToken))
      .send({ month: 10, year: 2026 })
      .expect(201);

    expect(second.body.summary).toMatchObject({ created: 0, skipped: 1, total: 1 });
    expect(second.body.results[0].status).toBe('SKIPPED');

    const list = await http().get('/invoices').set(bearer(acmeToken)).expect(200);
    expect(list.body).toHaveLength(1);
  });

  it('uses enrollment.monthlyFeeOverride when set', async () => {
    const groupId = await createGroup(acmeToken, 'Inglés A1', 50);
    const ana = await createStudent(acmeToken, 'Ana', 'García');
    const beto = await createStudent(acmeToken, 'Beto', 'López');
    const enrollmentA = await enroll(acmeToken, ana, groupId);
    await enroll(acmeToken, beto, groupId);

    await http()
      .patch(`/enrollments/${enrollmentA}`)
      .set(bearer(acmeToken))
      .send({ monthlyFeeOverride: 30 })
      .expect(200);

    const res = await http()
      .post('/billing/generate-month')
      .set(bearer(acmeToken))
      .send({ month: 11, year: 2026 })
      .expect(201);

    expect(res.body.summary.created).toBe(2);
    const byStudent = Object.fromEntries(
      res.body.results.map((r: { studentName: string; amount: string }) => [
        r.studentName,
        Number(r.amount),
      ]),
    );
    expect(byStudent['Ana García']).toBe(30);
    expect(byStudent['Beto López']).toBe(50);
  });

  it('marks enrollments without fee (group + override null) as NO_FEE', async () => {
    const groupId = await createGroup(acmeToken, 'Free trial');
    const ana = await createStudent(acmeToken, 'Ana', 'Trial');
    await enroll(acmeToken, ana, groupId);

    const res = await http()
      .post('/billing/generate-month')
      .set(bearer(acmeToken))
      .send({ month: 9, year: 2026 })
      .expect(201);

    expect(res.body.summary).toMatchObject({ created: 0, noFee: 1, total: 1 });
    expect(res.body.results[0].status).toBe('NO_FEE');

    const list = await http().get('/invoices').set(bearer(acmeToken)).expect(200);
    expect(list.body).toHaveLength(0);
  });

  it('dryRun returns WOULD_CREATE without creating invoices', async () => {
    const groupId = await createGroup(acmeToken, 'Inglés A1', 50);
    const ana = await createStudent(acmeToken, 'Ana', 'García');
    await enroll(acmeToken, ana, groupId);

    const res = await http()
      .post('/billing/generate-month')
      .set(bearer(acmeToken))
      .send({ month: 12, year: 2026, dryRun: true })
      .expect(201);

    expect(res.body.dryRun).toBe(true);
    expect(res.body.summary).toMatchObject({
      created: 0,
      wouldCreate: 1,
      total: 1,
    });
    expect(res.body.results[0].status).toBe('WOULD_CREATE');
    expect(res.body.results[0].invoiceId).toBeNull();

    const list = await http().get('/invoices').set(bearer(acmeToken)).expect(200);
    expect(list.body).toHaveLength(0);
  });

  it('skips non-ACTIVE enrollments', async () => {
    const groupId = await createGroup(acmeToken, 'Inglés A1', 50);
    const ana = await createStudent(acmeToken, 'Ana', 'García');
    const beto = await createStudent(acmeToken, 'Beto', 'López');
    const enrollmentA = await enroll(acmeToken, ana, groupId);
    await enroll(acmeToken, beto, groupId);

    await http()
      .patch(`/enrollments/${enrollmentA}`)
      .set(bearer(acmeToken))
      .send({ status: 'DROPPED', droppedAt: new Date().toISOString() })
      .expect(200);

    const res = await http()
      .post('/billing/generate-month')
      .set(bearer(acmeToken))
      .send({ month: 10, year: 2026 })
      .expect(201);

    expect(res.body.summary.total).toBe(1);
    expect(res.body.results[0].studentName).toBe('Beto López');
  });

  it('isolates billing between tenants', async () => {
    const groupId = await createGroup(acmeToken, 'Inglés A1', 50);
    const ana = await createStudent(acmeToken, 'Ana', 'García');
    await enroll(acmeToken, ana, groupId);

    const beta = await seedTenant(prisma, {
      slug: 'beta',
      email: 'admin@beta.local',
      password: 'TestPassword123!',
    });
    const betaToken = await login(beta);
    const betaCourse = await http()
      .post('/courses')
      .set(bearer(betaToken))
      .send({ name: 'Música' })
      .expect(201);
    const betaGroup = await createGroup(betaToken, 'Piano', 80, betaCourse.body.id);
    const betaStudent = await createStudent(betaToken, 'Carla', 'Beta');
    await enroll(betaToken, betaStudent, betaGroup);

    const acmeRun = await http()
      .post('/billing/generate-month')
      .set(bearer(acmeToken))
      .send({ month: 10, year: 2026 })
      .expect(201);
    expect(acmeRun.body.summary.created).toBe(1);
    expect(acmeRun.body.results[0].studentName).toBe('Ana García');

    const betaRun = await http()
      .post('/billing/generate-month')
      .set(bearer(betaToken))
      .send({ month: 10, year: 2026 })
      .expect(201);
    expect(betaRun.body.summary.created).toBe(1);
    expect(betaRun.body.results[0].studentName).toBe('Carla Beta');

    const acmeList = await http().get('/invoices').set(bearer(acmeToken)).expect(200);
    expect(acmeList.body).toHaveLength(1);
    expect(Number(acmeList.body[0].amount)).toBe(50);

    const betaList = await http().get('/invoices').set(bearer(betaToken)).expect(200);
    expect(betaList.body).toHaveLength(1);
    expect(Number(betaList.body[0].amount)).toBe(80);
  });

  it('rejects invalid month / year with 400', async () => {
    await http()
      .post('/billing/generate-month')
      .set(bearer(acmeToken))
      .send({ month: 13, year: 2026 })
      .expect(400);
    await http()
      .post('/billing/generate-month')
      .set(bearer(acmeToken))
      .send({ month: 0, year: 2026 })
      .expect(400);
    await http()
      .post('/billing/generate-month')
      .set(bearer(acmeToken))
      .send({ month: 10, year: 1999 })
      .expect(400);
  });

  it('rejects unauthenticated requests with 401', async () => {
    await http()
      .post('/billing/generate-month')
      .send({ month: 10, year: 2026 })
      .expect(401);
  });
});
