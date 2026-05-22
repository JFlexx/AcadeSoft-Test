import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapTestApp, resetDb, seedTenant, SeededTenant } from './setup-e2e';

describe('Settings (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let acme: SeededTenant;
  let acmeToken: string;

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

  it('returns current settings with empty fiscal fields by default', async () => {
    const res = await http().get('/settings').set(bearer(acmeToken)).expect(200);
    expect(res.body).toMatchObject({
      id: acme.tenantId,
      name: 'acme',
      slug: 'acme',
      legalName: null,
      taxId: null,
      iban: null,
      sepaCreditorId: null,
      invoicePrefix: 'F',
    });
  });

  it('updates settings and persists them', async () => {
    const updated = await http()
      .patch('/settings')
      .set(bearer(acmeToken))
      .send({
        name: 'Academia Acme',
        legalName: 'Acme Formación SL',
        taxId: 'B12345678',
        address: 'Calle Mayor 1, Madrid',
        contactEmail: 'hola@acme.local',
        contactPhone: '+34 600 000 000',
        iban: 'ES9121000418450200051332',
        sepaCreditorId: 'ES12ZZZB12345678',
        invoicePrefix: 'FAC',
      })
      .expect(200);

    expect(updated.body).toMatchObject({
      name: 'Academia Acme',
      legalName: 'Acme Formación SL',
      taxId: 'B12345678',
      iban: 'ES9121000418450200051332',
      sepaCreditorId: 'ES12ZZZB12345678',
      invoicePrefix: 'FAC',
    });

    const fetched = await http().get('/settings').set(bearer(acmeToken)).expect(200);
    expect(fetched.body.legalName).toBe('Acme Formación SL');
    expect(fetched.body.invoicePrefix).toBe('FAC');
  });

  it('reflects updated prefix in newly generated invoice numbers', async () => {
    await http()
      .patch('/settings')
      .set(bearer(acmeToken))
      .send({ invoicePrefix: 'FAC' })
      .expect(200);

    const student = await http()
      .post('/students')
      .set(bearer(acmeToken))
      .send({ firstName: 'Ana', lastName: 'García' })
      .expect(201);

    const invoice = await http()
      .post('/invoices')
      .set(bearer(acmeToken))
      .send({ studentId: student.body.id, amount: 50 })
      .expect(201);

    expect(invoice.body.number).toMatch(/^FAC-\d{4}-0001$/);
  });

  it('isolates settings between tenants', async () => {
    const beta = await seedTenant(prisma, {
      slug: 'beta',
      email: 'admin@beta.local',
      password: 'TestPassword123!',
    });
    const betaToken = await login(beta);

    await http()
      .patch('/settings')
      .set(bearer(acmeToken))
      .send({ legalName: 'Acme SL' })
      .expect(200);

    const betaSettings = await http()
      .get('/settings')
      .set(bearer(betaToken))
      .expect(200);
    expect(betaSettings.body.id).toBe(beta.tenantId);
    expect(betaSettings.body.legalName).toBeNull();
  });

  it('rejects extra fields and invalid email with 400', async () => {
    await http()
      .patch('/settings')
      .set(bearer(acmeToken))
      .send({ evil: true })
      .expect(400);

    await http()
      .patch('/settings')
      .set(bearer(acmeToken))
      .send({ contactEmail: 'not-an-email' })
      .expect(400);
  });

  it('rejects unauthenticated requests with 401', async () => {
    await http().get('/settings').expect(401);
    await http().patch('/settings').send({ legalName: 'X' }).expect(401);
  });
});
