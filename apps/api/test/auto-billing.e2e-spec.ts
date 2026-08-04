import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { BillingService } from '../src/billing/billing.service';
import { bootstrapTestApp, resetDb, seedTenant, SeededTenant } from './setup-e2e';

describe('Automatic recurring billing (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let billing: BillingService;
  let acme: SeededTenant;
  let token: string;

  // a fixed "today" with a day in 1..28 so it is a valid autoBillingDay
  const NOW = new Date();
  NOW.setDate(15);
  NOW.setHours(12, 0, 0, 0);
  const DAY = 15;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapTestApp());
    billing = app.get(BillingService);
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
    token = await login();
    // a group with a fee and one active enrollment
    const course = await http().post('/courses').set(bearer(token)).send({ name: 'Inglés' }).expect(201);
    const group = await http()
      .post('/groups')
      .set(bearer(token))
      .send({ courseId: course.body.id, name: 'B1', monthlyFee: 50 })
      .expect(201);
    const student = await http().post('/students').set(bearer(token)).send({ firstName: 'Ana', lastName: 'G' }).expect(201);
    await http()
      .post('/enrollments')
      .set(bearer(token))
      .send({ studentId: student.body.id, groupId: group.body.id, status: 'ACTIVE' })
      .expect(201);
  });

  function http() {
    return request(app.getHttpServer());
  }

  async function login(): Promise<string> {
    const res = await http()
      .post('/auth/login')
      .send({ tenantSlug: 'acme', email: 'admin@acme.local', password: 'TestPassword123!' })
      .expect(200);
    return res.body.accessToken;
  }

  function bearer(t: string) {
    return { Authorization: `Bearer ${t}` };
  }

  async function setAuto(enabled: boolean, day: number) {
    await http()
      .patch('/settings')
      .set(bearer(token))
      .send({ autoBillingEnabled: enabled, autoBillingDay: day })
      .expect(200);
  }

  async function invoiceCount() {
    const res = await http().get('/invoices').set(bearer(token)).expect(200);
    return res.body.length;
  }

  it('exposes the settings with sane defaults', async () => {
    const res = await http().get('/settings').set(bearer(token)).expect(200);
    expect(res.body.autoBillingEnabled).toBe(false);
    expect(res.body.autoBillingDay).toBe(1);
  });

  it('generates the month for an opted-in tenant on its billing day', async () => {
    await setAuto(true, DAY);

    const res = await billing.runScheduledBilling(NOW);
    expect(res.tenants).toBe(1);
    expect(res.created).toBe(1);
    expect(await invoiceCount()).toBe(1);

    // idempotent: running again creates nothing
    const again = await billing.runScheduledBilling(NOW);
    expect(again.created).toBe(0);
    expect(await invoiceCount()).toBe(1);
  });

  it('does nothing when today is not the billing day', async () => {
    await setAuto(true, DAY);
    const other = new Date(NOW);
    other.setDate(10);
    const res = await billing.runScheduledBilling(other);
    expect(res.tenants).toBe(0);
    expect(await invoiceCount()).toBe(0);
  });

  it('does nothing when auto billing is disabled', async () => {
    await setAuto(false, DAY);
    const res = await billing.runScheduledBilling(NOW);
    expect(res.tenants).toBe(0);
    expect(await invoiceCount()).toBe(0);
  });

  it('rejects an out-of-range billing day (400)', async () => {
    await http().patch('/settings').set(bearer(token)).send({ autoBillingDay: 0 }).expect(400);
    await http().patch('/settings').set(bearer(token)).send({ autoBillingDay: 29 }).expect(400);
  });
});
