const mockSessionsCreate = jest.fn();
const mockConstructEvent = jest.fn();

jest.mock('stripe', () =>
  jest.fn().mockImplementation(() => ({
    checkout: { sessions: { create: mockSessionsCreate } },
    webhooks: { constructEvent: mockConstructEvent },
  })),
);

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapTestApp, resetDb, seedTenant, SeededTenant } from './setup-e2e';

describe('Stripe card payments (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let acme: SeededTenant;
  let token: string;
  let studentId: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    mockSessionsCreate.mockReset();
    mockConstructEvent.mockReset();
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

  async function createInvoice(amount = 50) {
    const res = await http()
      .post('/invoices')
      .set(bearer(token))
      .send({ studentId, amount, description: 'Mensualidad' })
      .expect(201);
    return res.body;
  }

  function completedEvent(tenantId: string, invoiceId: string, cents: number, pi = 'pi_1') {
    return {
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_1',
          amount_total: cents,
          payment_intent: pi,
          metadata: { tenantId, invoiceId },
        },
      },
    };
  }

  it('creates a checkout session URL for an invoice', async () => {
    const inv = await createInvoice(50);
    mockSessionsCreate.mockResolvedValue({ url: 'https://stripe.test/pay/abc' });

    const res = await http()
      .post(`/invoices/${inv.id}/checkout`)
      .set(bearer(token))
      .expect(201);
    expect(res.body.url).toBe('https://stripe.test/pay/abc');

    // amount charged is the pending amount in cents
    const arg = mockSessionsCreate.mock.calls[0][0];
    expect(arg.line_items[0].price_data.unit_amount).toBe(5000);
    expect(arg.metadata).toMatchObject({ tenantId: acme.tenantId, invoiceId: inv.id });
  });

  it('marks the invoice PAID when the webhook confirms payment', async () => {
    const inv = await createInvoice(50);
    mockConstructEvent.mockReturnValue(completedEvent(acme.tenantId, inv.id, 5000));

    const res = await http()
      .post('/stripe/webhook')
      .set('stripe-signature', 'sig')
      .send({ any: 'payload' })
      .expect(200);
    expect(res.body).toEqual({ received: true });

    const got = await http().get(`/invoices/${inv.id}`).set(bearer(token)).expect(200);
    expect(got.body.status).toBe('PAID');
    expect(Number(got.body.paidAmount)).toBe(50);
    expect(got.body.payments[0].method).toBe('CARD');
  });

  it('is idempotent: the same webhook twice records one payment', async () => {
    const inv = await createInvoice(50);
    mockConstructEvent.mockReturnValue(completedEvent(acme.tenantId, inv.id, 5000, 'pi_dup'));

    await http().post('/stripe/webhook').set('stripe-signature', 'sig').send({ a: 1 }).expect(200);
    await http().post('/stripe/webhook').set('stripe-signature', 'sig').send({ a: 1 }).expect(200);

    const got = await http().get(`/invoices/${inv.id}`).set(bearer(token)).expect(200);
    expect(got.body.payments).toHaveLength(1);
    expect(Number(got.body.paidAmount)).toBe(50);
  });

  it('rejects a webhook with a bad signature (400)', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error('bad signature');
    });
    await http()
      .post('/stripe/webhook')
      .set('stripe-signature', 'nope')
      .send({ a: 1 })
      .expect(400);
  });

  it('does not create checkout for a paid or cancelled invoice', async () => {
    const inv = await createInvoice(50);
    // pay it fully via the admin flow
    await http()
      .post(`/invoices/${inv.id}/payments`)
      .set(bearer(token))
      .send({ amount: 50, method: 'CASH' })
      .expect(201);

    await http().post(`/invoices/${inv.id}/checkout`).set(bearer(token)).expect(400);
  });

  it('404 for an unknown invoice; 401 without auth', async () => {
    await http().post('/invoices/nope/checkout').set(bearer(token)).expect(404);
    await http().post('/invoices/nope/checkout').expect(401);
  });
});
