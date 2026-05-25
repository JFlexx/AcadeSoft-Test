import { INestApplication } from '@nestjs/common';
import { createHash } from 'crypto';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapTestApp, resetDb, seedTenant, SeededTenant } from './setup-e2e';

// Mirror of the production hash formula (apps/api/src/invoices/invoice-hash.ts).
// Duplicated here on purpose so the test fails loudly if the production formula
// changes silently — at that point the chain version needs a deliberate bump.
function expectedHash(p: {
  emitterTaxId: string;
  invoiceNumber: string;
  issueDate: string; // YYYY-MM-DD
  amount: string; // "50.00"
  previousHash: string;
}): string {
  const payload = [
    p.emitterTaxId,
    p.invoiceNumber,
    p.issueDate,
    p.amount,
    p.previousHash,
  ].join('|');
  return createHash('sha256').update(payload).digest('hex').toUpperCase();
}

describe('Invoice hash chain (e2e)', () => {
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

  async function fetchTenantTaxIdOrId(slug: string): Promise<string> {
    const t = await prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, taxId: true },
    });
    return t!.taxId ?? t!.id;
  }

  it('first invoice has a hash and a null previousHash', async () => {
    const inv = await http()
      .post('/invoices')
      .set(bearer(acmeToken))
      .send({
        studentId: acmeStudentId,
        amount: 50,
        issueDate: '2026-10-01T12:00:00.000Z',
      })
      .expect(201);

    expect(inv.body.hash).toMatch(/^[0-9A-F]{64}$/);
    expect(inv.body.previousHash).toBeNull();
    expect(inv.body.hashedAt).toEqual(expect.any(String));
  });

  it('second invoice chains: its previousHash equals first invoice hash', async () => {
    const first = await http()
      .post('/invoices')
      .set(bearer(acmeToken))
      .send({ studentId: acmeStudentId, amount: 50, issueDate: '2026-10-01T12:00:00.000Z' })
      .expect(201);
    const second = await http()
      .post('/invoices')
      .set(bearer(acmeToken))
      .send({ studentId: acmeStudentId, amount: 75, issueDate: '2026-10-02T12:00:00.000Z' })
      .expect(201);

    expect(second.body.previousHash).toBe(first.body.hash);
    expect(second.body.hash).not.toBe(first.body.hash);
  });

  it('hash is deterministic from key fields + previous', async () => {
    const inv = await http()
      .post('/invoices')
      .set(bearer(acmeToken))
      .send({ studentId: acmeStudentId, amount: 100, issueDate: '2026-10-01T12:00:00.000Z' })
      .expect(201);

    const emitter = await fetchTenantTaxIdOrId('acme');
    const expected = expectedHash({
      emitterTaxId: emitter,
      invoiceNumber: inv.body.number,
      issueDate: '2026-10-01',
      amount: '100.00',
      previousHash: '', // first invoice → empty
    });
    expect(inv.body.hash).toBe(expected);
  });

  it('blocks changing issueDate on a hashed invoice', async () => {
    const inv = await http()
      .post('/invoices')
      .set(bearer(acmeToken))
      .send({ studentId: acmeStudentId, amount: 50 })
      .expect(201);

    await http()
      .patch(`/invoices/${inv.body.id}`)
      .set(bearer(acmeToken))
      .send({ issueDate: '2026-12-31T12:00:00.000Z' })
      .expect(400);

    // metadata changes still allowed
    await http()
      .patch(`/invoices/${inv.body.id}`)
      .set(bearer(acmeToken))
      .send({ notes: 'nota nueva' })
      .expect(200);
  });

  it('blocks deletion of a hashed invoice (even without payments)', async () => {
    const inv = await http()
      .post('/invoices')
      .set(bearer(acmeToken))
      .send({ studentId: acmeStudentId, amount: 50 })
      .expect(201);

    await http()
      .delete(`/invoices/${inv.body.id}`)
      .set(bearer(acmeToken))
      .expect(400);

    // but CANCELLED status still allowed as the rectification path
    await http()
      .patch(`/invoices/${inv.body.id}`)
      .set(bearer(acmeToken))
      .send({ status: 'CANCELLED' })
      .expect(200);
  });

  it('recurring-billing invoices also chain correctly', async () => {
    // Configure a group with monthly fee + enroll Ana
    const course = await http()
      .post('/courses')
      .set(bearer(acmeToken))
      .send({ name: 'Inglés' })
      .expect(201);
    const group = await http()
      .post('/groups')
      .set(bearer(acmeToken))
      .send({ courseId: course.body.id, name: 'Inglés A1', monthlyFee: 60 })
      .expect(201);
    await http()
      .post('/enrollments')
      .set(bearer(acmeToken))
      .send({ studentId: acmeStudentId, groupId: group.body.id })
      .expect(201);

    // Create a manual invoice FIRST so we have a known previousHash
    const manual = await http()
      .post('/invoices')
      .set(bearer(acmeToken))
      .send({ studentId: acmeStudentId, amount: 10, issueDate: '2026-10-01T12:00:00.000Z' })
      .expect(201);

    // Now generate mensualidades for October → 1 invoice
    const gen = await http()
      .post('/billing/generate-month')
      .set(bearer(acmeToken))
      .send({ month: 10, year: 2026 })
      .expect(201);
    const billingInvoiceId = gen.body.results[0].invoiceId;

    const billing = await http()
      .get(`/invoices/${billingInvoiceId}`)
      .set(bearer(acmeToken))
      .expect(200);

    expect(billing.body.hash).toMatch(/^[0-9A-F]{64}$/);
    expect(billing.body.previousHash).toBe(manual.body.hash);
  });

  it('chains are isolated per tenant', async () => {
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

    const acmeInv = await http()
      .post('/invoices')
      .set(bearer(acmeToken))
      .send({ studentId: acmeStudentId, amount: 50 })
      .expect(201);

    const betaInv = await http()
      .post('/invoices')
      .set(bearer(betaToken))
      .send({ studentId: betaStudent.body.id, amount: 30 })
      .expect(201);

    // Beta's first invoice must NOT chain off Acme's
    expect(betaInv.body.previousHash).toBeNull();
    expect(betaInv.body.hash).not.toBe(acmeInv.body.hash);
  });
});
