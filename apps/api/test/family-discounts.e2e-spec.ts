import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapTestApp, resetDb, seedTenant, SeededTenant } from './setup-e2e';

describe('Family/sibling discounts (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let acme: SeededTenant;
  let token: string;
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
    token = await login(acme);
    const course = await http()
      .post('/courses')
      .set(bearer(token))
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

  function bearer(t: string) {
    return { Authorization: `Bearer ${t}` };
  }

  async function createStudent(
    firstName: string,
    lastName: string,
    discountPercent?: number,
  ) {
    const payload: Record<string, unknown> = { firstName, lastName };
    if (discountPercent !== undefined) payload.discountPercent = discountPercent;
    const res = await http()
      .post('/students')
      .set(bearer(token))
      .send(payload)
      .expect(201);
    return res.body.id as string;
  }

  async function createGroup(name: string, monthlyFee: number) {
    const res = await http()
      .post('/groups')
      .set(bearer(token))
      .send({ courseId, name, monthlyFee })
      .expect(201);
    return res.body.id as string;
  }

  async function enroll(studentId: string, groupId: string) {
    const res = await http()
      .post('/enrollments')
      .set(bearer(token))
      .send({ studentId, groupId })
      .expect(201);
    return res.body.id as string;
  }

  async function generate(month: number, year = 2026, dryRun = false) {
    const res = await http()
      .post('/billing/generate-month')
      .set(bearer(token))
      .send({ month, year, dryRun })
      .expect(201);
    return res.body;
  }

  it('applies the student discount to the group fee', async () => {
    const groupId = await createGroup('Inglés A1', 50);
    const ana = await createStudent('Ana', 'García', 20); // 20% off
    await enroll(ana, groupId);

    const run = await generate(10);
    expect(run.summary.created).toBe(1);
    expect(Number(run.results[0].amount)).toBe(40);

    const invId = run.results[0].invoiceId;
    const inv = await http()
      .get(`/invoices/${invId}`)
      .set(bearer(token))
      .expect(200);
    expect(Number(inv.body.amount)).toBe(40);
    expect(inv.body.notes).toMatch(/Descuento 20%/);
    expect(inv.body.notes).toMatch(/50\.00/);
  });

  it('applies the discount on top of an enrollment fee override', async () => {
    const groupId = await createGroup('Inglés A1', 50);
    const ana = await createStudent('Ana', 'García', 10); // 10% off
    const enrollmentId = await enroll(ana, groupId);
    await http()
      .patch(`/enrollments/${enrollmentId}`)
      .set(bearer(token))
      .send({ monthlyFeeOverride: 30 })
      .expect(200);

    const run = await generate(11);
    expect(Number(run.results[0].amount)).toBe(27); // 30 - 10%
  });

  it('rounds the discounted amount to cents', async () => {
    const groupId = await createGroup('Inglés A1', 10);
    const ana = await createStudent('Ana', 'García', 33.33);
    await enroll(ana, groupId);

    const run = await generate(10);
    // 10 * (1 - 0.3333) = 6.667 -> 6.67
    expect(Number(run.results[0].amount)).toBe(6.67);
  });

  it('charges the full fee when there is no discount', async () => {
    const groupId = await createGroup('Inglés A1', 50);
    const ana = await createStudent('Ana', 'García'); // no discount
    await enroll(ana, groupId);

    const run = await generate(10);
    expect(Number(run.results[0].amount)).toBe(50);

    const inv = await http()
      .get(`/invoices/${run.results[0].invoiceId}`)
      .set(bearer(token))
      .expect(200);
    expect(inv.body.notes).toBeNull();
  });

  it('reflects the discounted amount in a dry run', async () => {
    const groupId = await createGroup('Inglés A1', 100);
    const ana = await createStudent('Ana', 'García', 25);
    await enroll(ana, groupId);

    const run = await generate(10, 2026, true);
    expect(run.dryRun).toBe(true);
    expect(run.results[0].status).toBe('WOULD_CREATE');
    expect(Number(run.results[0].amount)).toBe(75);
  });

  it('rejects out-of-range discount values with 400', async () => {
    await http()
      .post('/students')
      .set(bearer(token))
      .send({ firstName: 'X', lastName: 'Y', discountPercent: 150 })
      .expect(400);
    await http()
      .post('/students')
      .set(bearer(token))
      .send({ firstName: 'X', lastName: 'Y', discountPercent: -5 })
      .expect(400);
  });
});
