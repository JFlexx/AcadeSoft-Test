import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { InvoicesService } from '../src/invoices/invoices.service';
import { bootstrapTestApp, resetDb, seedTenant, SeededTenant } from './setup-e2e';

describe('Overdue invoices (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let invoices: InvoicesService;
  let acme: SeededTenant;
  let token: string;
  let studentId: string;

  const PAST = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const FUTURE = new Date(Date.now() + 3 * 86_400_000).toISOString();

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapTestApp());
    invoices = app.get(InvoicesService);
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
    const s = await http()
      .post('/students')
      .set(bearer(token))
      .send({ firstName: 'Ana', lastName: 'García' })
      .expect(201);
    studentId = s.body.id;
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

  async function createInvoice(amount: number, dueDate?: string) {
    const body: Record<string, unknown> = { studentId, amount };
    if (dueDate) body.dueDate = dueDate;
    const res = await http().post('/invoices').set(bearer(token)).send(body).expect(201);
    return res.body;
  }

  async function statusOf(id: string) {
    const res = await http().get(`/invoices/${id}`).set(bearer(token)).expect(200);
    return res.body.status;
  }

  it('flags a past-due unpaid invoice as OVERDUE', async () => {
    const inv = await createInvoice(50, PAST);
    expect(await statusOf(inv.id)).toBe('PENDING'); // not overdue until the job runs

    const n = await invoices.markOverdueInvoices();
    expect(n).toBeGreaterThanOrEqual(1);
    expect(await statusOf(inv.id)).toBe('OVERDUE');
  });

  it('leaves future-due and no-due invoices as PENDING', async () => {
    const future = await createInvoice(50, FUTURE);
    const noDue = await createInvoice(50);

    await invoices.markOverdueInvoices();

    expect(await statusOf(future.id)).toBe('PENDING');
    expect(await statusOf(noDue.id)).toBe('PENDING');
  });

  it('a partial payment on a past-due invoice stays OVERDUE; full payment → PAID', async () => {
    const inv = await createInvoice(50, PAST);
    await invoices.markOverdueInvoices();
    expect(await statusOf(inv.id)).toBe('OVERDUE');

    await http()
      .post(`/invoices/${inv.id}/payments`)
      .set(bearer(token))
      .send({ amount: 20, method: 'CASH' })
      .expect(201);
    expect(await statusOf(inv.id)).toBe('OVERDUE'); // still owes, past due

    await http()
      .post(`/invoices/${inv.id}/payments`)
      .set(bearer(token))
      .send({ amount: 30, method: 'CASH' })
      .expect(201);
    expect(await statusOf(inv.id)).toBe('PAID');
  });

  it('is idempotent and never touches paid invoices', async () => {
    const inv = await createInvoice(50, PAST);
    await http()
      .post(`/invoices/${inv.id}/payments`)
      .set(bearer(token))
      .send({ amount: 50, method: 'CASH' })
      .expect(201);
    expect(await statusOf(inv.id)).toBe('PAID');

    const n = await invoices.markOverdueInvoices();
    expect(n).toBe(0);
    expect(await statusOf(inv.id)).toBe('PAID');
  });
});
