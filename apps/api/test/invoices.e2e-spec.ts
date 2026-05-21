import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapTestApp, resetDb, seedTenant, SeededTenant } from './setup-e2e';

describe('Invoices (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let acme: SeededTenant;
  let acmeToken: string;
  let acmeStudentId: string;

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
    const student = await http()
      .post('/students')
      .set(bearer(acmeToken))
      .send({ firstName: 'Ana', lastName: 'García' })
      .expect(201);
    acmeStudentId = student.body.id;
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

  it('creates an invoice with auto-generated number and PENDING status', async () => {
    const res = await http()
      .post('/invoices')
      .set(bearer(acmeToken))
      .send({
        studentId: acmeStudentId,
        amount: 100,
        description: 'Mensualidad octubre',
        dueDate: '2026-10-31',
      })
      .expect(201);

    expect(res.body).toMatchObject({
      tenantId: acme.tenantId,
      studentId: acmeStudentId,
      description: 'Mensualidad octubre',
      status: 'PENDING',
    });
    expect(res.body.number).toMatch(/^F-\d{4}-0001$/);
    expect(Number(res.body.amount)).toBe(100);
    expect(Number(res.body.paidAmount)).toBe(0);
  });

  it('generates sequential invoice numbers per tenant', async () => {
    const first = await http()
      .post('/invoices')
      .set(bearer(acmeToken))
      .send({ studentId: acmeStudentId, amount: 50 })
      .expect(201);
    const second = await http()
      .post('/invoices')
      .set(bearer(acmeToken))
      .send({ studentId: acmeStudentId, amount: 75 })
      .expect(201);

    expect(first.body.number).toMatch(/-0001$/);
    expect(second.body.number).toMatch(/-0002$/);
  });

  it('handles partial payments and transitions status PENDING → PARTIAL → PAID', async () => {
    const invoice = await http()
      .post('/invoices')
      .set(bearer(acmeToken))
      .send({ studentId: acmeStudentId, amount: 100 })
      .expect(201);

    const first = await http()
      .post(`/invoices/${invoice.body.id}/payments`)
      .set(bearer(acmeToken))
      .send({ amount: 40, method: 'CASH' })
      .expect(201);
    expect(Number(first.body.amount)).toBe(40);

    let detail = await http()
      .get(`/invoices/${invoice.body.id}`)
      .set(bearer(acmeToken))
      .expect(200);
    expect(detail.body.status).toBe('PARTIAL');
    expect(Number(detail.body.paidAmount)).toBe(40);
    expect(detail.body.payments).toHaveLength(1);

    await http()
      .post(`/invoices/${invoice.body.id}/payments`)
      .set(bearer(acmeToken))
      .send({ amount: 60, method: 'TRANSFER', reference: 'TRX-9' })
      .expect(201);

    detail = await http()
      .get(`/invoices/${invoice.body.id}`)
      .set(bearer(acmeToken))
      .expect(200);
    expect(detail.body.status).toBe('PAID');
    expect(Number(detail.body.paidAmount)).toBe(100);
    expect(detail.body.payments).toHaveLength(2);
  });

  it('rejects overpayment with 400', async () => {
    const invoice = await http()
      .post('/invoices')
      .set(bearer(acmeToken))
      .send({ studentId: acmeStudentId, amount: 100 })
      .expect(201);

    await http()
      .post(`/invoices/${invoice.body.id}/payments`)
      .set(bearer(acmeToken))
      .send({ amount: 60 })
      .expect(201);

    await http()
      .post(`/invoices/${invoice.body.id}/payments`)
      .set(bearer(acmeToken))
      .send({ amount: 50 })
      .expect(400);
  });

  it('recomputes status when deleting a payment', async () => {
    const invoice = await http()
      .post('/invoices')
      .set(bearer(acmeToken))
      .send({ studentId: acmeStudentId, amount: 100 })
      .expect(201);

    const payment = await http()
      .post(`/invoices/${invoice.body.id}/payments`)
      .set(bearer(acmeToken))
      .send({ amount: 100 })
      .expect(201);

    let detail = await http()
      .get(`/invoices/${invoice.body.id}`)
      .set(bearer(acmeToken))
      .expect(200);
    expect(detail.body.status).toBe('PAID');

    await http()
      .delete(`/payments/${payment.body.id}`)
      .set(bearer(acmeToken))
      .expect(204);

    detail = await http()
      .get(`/invoices/${invoice.body.id}`)
      .set(bearer(acmeToken))
      .expect(200);
    expect(detail.body.status).toBe('PENDING');
    expect(Number(detail.body.paidAmount)).toBe(0);
  });

  it('cancels an invoice and blocks further payments', async () => {
    const invoice = await http()
      .post('/invoices')
      .set(bearer(acmeToken))
      .send({ studentId: acmeStudentId, amount: 50 })
      .expect(201);

    const cancelled = await http()
      .patch(`/invoices/${invoice.body.id}`)
      .set(bearer(acmeToken))
      .send({ status: 'CANCELLED' })
      .expect(200);
    expect(cancelled.body.status).toBe('CANCELLED');

    await http()
      .post(`/invoices/${invoice.body.id}/payments`)
      .set(bearer(acmeToken))
      .send({ amount: 50 })
      .expect(400);
  });

  it('blocks deletion when an invoice has payments', async () => {
    const invoice = await http()
      .post('/invoices')
      .set(bearer(acmeToken))
      .send({ studentId: acmeStudentId, amount: 100 })
      .expect(201);

    await http()
      .post(`/invoices/${invoice.body.id}/payments`)
      .set(bearer(acmeToken))
      .send({ amount: 30 })
      .expect(201);

    await http()
      .delete(`/invoices/${invoice.body.id}`)
      .set(bearer(acmeToken))
      .expect(400);
  });

  it('filters list by studentId and status', async () => {
    const other = await http()
      .post('/students')
      .set(bearer(acmeToken))
      .send({ firstName: 'Otro', lastName: 'Alumno' })
      .expect(201);

    await http()
      .post('/invoices')
      .set(bearer(acmeToken))
      .send({ studentId: acmeStudentId, amount: 100 })
      .expect(201);
    const paid = await http()
      .post('/invoices')
      .set(bearer(acmeToken))
      .send({ studentId: acmeStudentId, amount: 50 })
      .expect(201);
    await http()
      .post(`/invoices/${paid.body.id}/payments`)
      .set(bearer(acmeToken))
      .send({ amount: 50 })
      .expect(201);
    await http()
      .post('/invoices')
      .set(bearer(acmeToken))
      .send({ studentId: other.body.id, amount: 200 })
      .expect(201);

    const byStudent = await http()
      .get(`/invoices?studentId=${acmeStudentId}`)
      .set(bearer(acmeToken))
      .expect(200);
    expect(byStudent.body).toHaveLength(2);

    const paidOnly = await http()
      .get('/invoices?status=PAID')
      .set(bearer(acmeToken))
      .expect(200);
    expect(paidOnly.body).toHaveLength(1);
    expect(paidOnly.body[0].id).toBe(paid.body.id);
  });

  it('isolates invoices and payments between tenants', async () => {
    const beta = await seedTenant(prisma, {
      slug: 'beta',
      email: 'admin@beta.local',
      password: 'TestPassword123!',
    });
    const betaToken = await login(beta);
    const betaStudent = await http()
      .post('/students')
      .set(bearer(betaToken))
      .send({ firstName: 'Bruno', lastName: 'Beta' })
      .expect(201);

    const acmeInvoice = await http()
      .post('/invoices')
      .set(bearer(acmeToken))
      .send({ studentId: acmeStudentId, amount: 100 })
      .expect(201);

    // beta cannot create an invoice for an acme student
    await http()
      .post('/invoices')
      .set(bearer(betaToken))
      .send({ studentId: acmeStudentId, amount: 100 })
      .expect(400);

    // beta cannot see acme's invoices
    const betaList = await http().get('/invoices').set(bearer(betaToken)).expect(200);
    expect(betaList.body).toHaveLength(0);

    // beta cannot fetch / update / delete an acme invoice
    await http()
      .get(`/invoices/${acmeInvoice.body.id}`)
      .set(bearer(betaToken))
      .expect(404);
    await http()
      .patch(`/invoices/${acmeInvoice.body.id}`)
      .set(bearer(betaToken))
      .send({ notes: 'pwned' })
      .expect(404);
    await http()
      .delete(`/invoices/${acmeInvoice.body.id}`)
      .set(bearer(betaToken))
      .expect(404);

    // beta cannot register a payment on an acme invoice
    await http()
      .post(`/invoices/${acmeInvoice.body.id}/payments`)
      .set(bearer(betaToken))
      .send({ amount: 10 })
      .expect(404);

    // beta CAN create its own invoice for its own student
    const betaInvoice = await http()
      .post('/invoices')
      .set(bearer(betaToken))
      .send({ studentId: betaStudent.body.id, amount: 200 })
      .expect(201);
    expect(betaInvoice.body.number).toMatch(/-0001$/); // own counter

    // acme cannot delete a beta payment
    const betaPayment = await http()
      .post(`/invoices/${betaInvoice.body.id}/payments`)
      .set(bearer(betaToken))
      .send({ amount: 50 })
      .expect(201);
    await http()
      .delete(`/payments/${betaPayment.body.id}`)
      .set(bearer(acmeToken))
      .expect(404);
  });

  it('rejects unauthenticated requests with 401', async () => {
    await http().get('/invoices').expect(401);
    await http()
      .post('/invoices')
      .send({ studentId: acmeStudentId, amount: 10 })
      .expect(401);
  });

  it('downloads a PDF for an invoice', async () => {
    const invoice = await http()
      .post('/invoices')
      .set(bearer(acmeToken))
      .send({
        studentId: acmeStudentId,
        amount: 100,
        description: 'Mensualidad octubre',
      })
      .expect(201);

    await http()
      .post(`/invoices/${invoice.body.id}/payments`)
      .set(bearer(acmeToken))
      .send({ amount: 40, method: 'CASH' })
      .expect(201);

    const res = await http()
      .get(`/invoices/${invoice.body.id}/pdf`)
      .set(bearer(acmeToken))
      .buffer(true)
      .parse((response, cb) => {
        const chunks: Buffer[] = [];
        response.on('data', (c: Buffer) => chunks.push(c));
        response.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);

    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.headers['content-disposition']).toMatch(
      /attachment; filename="factura-/,
    );
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(500);
    expect(res.body.slice(0, 4).toString()).toBe('%PDF');
  });

  it('blocks PDF download from another tenant with 404', async () => {
    const invoice = await http()
      .post('/invoices')
      .set(bearer(acmeToken))
      .send({ studentId: acmeStudentId, amount: 100 })
      .expect(201);

    const beta = await seedTenant(prisma, {
      slug: 'beta',
      email: 'admin@beta.local',
      password: 'TestPassword123!',
    });
    const betaToken = await login(beta);

    await http()
      .get(`/invoices/${invoice.body.id}/pdf`)
      .set(bearer(betaToken))
      .expect(404);
  });

  it('rejects unauthenticated PDF download with 401', async () => {
    const invoice = await http()
      .post('/invoices')
      .set(bearer(acmeToken))
      .send({ studentId: acmeStudentId, amount: 100 })
      .expect(201);

    await http().get(`/invoices/${invoice.body.id}/pdf`).expect(401);
  });

  it('rejects extra fields and invalid amounts with 400', async () => {
    await http()
      .post('/invoices')
      .set(bearer(acmeToken))
      .send({ studentId: acmeStudentId, amount: 10, evil: true })
      .expect(400);

    await http()
      .post('/invoices')
      .set(bearer(acmeToken))
      .send({ studentId: acmeStudentId, amount: 0 })
      .expect(400);

    await http()
      .post('/invoices')
      .set(bearer(acmeToken))
      .send({ studentId: acmeStudentId, amount: 10.123 })
      .expect(400);
  });
});
