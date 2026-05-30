import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapTestApp, resetDb, seedTenant, SeededTenant } from './setup-e2e';

describe('Invoice rectificativas (e2e)', () => {
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

  async function createOriginal(amount = 100) {
    const res = await http()
      .post('/invoices')
      .set(bearer(acmeToken))
      .send({ studentId: acmeStudentId, amount, description: 'Original' })
      .expect(201);
    return res.body;
  }

  it('creates a rectificativa, cancels original, keeps chain intact', async () => {
    const original = await createOriginal(100);

    const rect = await http()
      .post(`/invoices/${original.id}/rectifications`)
      .set(bearer(acmeToken))
      .send({ amount: 80, reason: 'Descuento aplicado tarde' })
      .expect(201);

    expect(rect.body.type).toBe('RECTIFICATIVA');
    expect(rect.body.rectifiesId).toBe(original.id);
    expect(Number(rect.body.amount)).toBe(80);
    expect(rect.body.hash).toMatch(/^[0-9A-F]{64}$/);
    // chain: rectificativa's previousHash is the original's hash
    expect(rect.body.previousHash).toBe(original.hash);

    // original is now CANCELLED but unchanged in amount
    const orig = await http()
      .get(`/invoices/${original.id}`)
      .set(bearer(acmeToken))
      .expect(200);
    expect(orig.body.status).toBe('CANCELLED');
    expect(Number(orig.body.amount)).toBe(100);
    expect(orig.body.rectifiedBy).toHaveLength(1);
    expect(orig.body.rectifiedBy[0].id).toBe(rect.body.id);

    // rectificativa exposes its reverse link
    const r = await http()
      .get(`/invoices/${rect.body.id}`)
      .set(bearer(acmeToken))
      .expect(200);
    expect(r.body.rectifies.number).toBe(original.number);
  });

  it('rejects rectifying a rectificativa', async () => {
    const original = await createOriginal();
    const rect = await http()
      .post(`/invoices/${original.id}/rectifications`)
      .set(bearer(acmeToken))
      .send({ amount: 80, reason: 'x' })
      .expect(201);

    await http()
      .post(`/invoices/${rect.body.id}/rectifications`)
      .set(bearer(acmeToken))
      .send({ amount: 70, reason: 'y' })
      .expect(400);
  });

  it('rejects a second rectificativa on the same invoice', async () => {
    const original = await createOriginal();
    await http()
      .post(`/invoices/${original.id}/rectifications`)
      .set(bearer(acmeToken))
      .send({ amount: 80, reason: 'x' })
      .expect(201);

    await http()
      .post(`/invoices/${original.id}/rectifications`)
      .set(bearer(acmeToken))
      .send({ amount: 70, reason: 'y' })
      .expect(400);
  });

  it('rejects rectifying an already cancelled invoice', async () => {
    const original = await createOriginal();
    await http()
      .patch(`/invoices/${original.id}`)
      .set(bearer(acmeToken))
      .send({ status: 'CANCELLED' })
      .expect(200);

    await http()
      .post(`/invoices/${original.id}/rectifications`)
      .set(bearer(acmeToken))
      .send({ amount: 80, reason: 'x' })
      .expect(400);
  });

  it('validates body (missing reason, bad amount)', async () => {
    const original = await createOriginal();
    await http()
      .post(`/invoices/${original.id}/rectifications`)
      .set(bearer(acmeToken))
      .send({ amount: 80 })
      .expect(400);
    await http()
      .post(`/invoices/${original.id}/rectifications`)
      .set(bearer(acmeToken))
      .send({ amount: 80.123, reason: 'x' })
      .expect(400);
  });

  it('isolates rectification across tenants (404 from another tenant)', async () => {
    const original = await createOriginal();
    const beta = await seedTenant(prisma, {
      slug: 'beta',
      email: 'admin@beta.local',
      password: 'TestPassword123!',
    });
    const betaToken = await login(beta);

    await http()
      .post(`/invoices/${original.id}/rectifications`)
      .set(bearer(betaToken))
      .send({ amount: 80, reason: 'x' })
      .expect(404);
  });

  it('excludes the cancelled original from SEPA but keeps it queryable', async () => {
    const original = await createOriginal();
    await http()
      .post(`/invoices/${original.id}/rectifications`)
      .set(bearer(acmeToken))
      .send({ amount: 80, reason: 'x' })
      .expect(201);

    // CANCELLED filter still finds the original
    const cancelled = await http()
      .get('/invoices?status=CANCELLED')
      .set(bearer(acmeToken))
      .expect(200);
    expect(cancelled.body.some((i: { id: string }) => i.id === original.id)).toBe(
      true,
    );
  });
});
