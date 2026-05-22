import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapTestApp, resetDb, seedTenant, SeededTenant } from './setup-e2e';

describe('SEPA remittance (e2e)', () => {
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

  async function setCreditorConfig(token: string) {
    await http()
      .patch('/settings')
      .set(bearer(token))
      .send({
        legalName: 'Acme Formación SL',
        iban: 'ES9121000418450200051332',
        sepaCreditorId: 'ES12ZZZB12345678',
      })
      .expect(200);
  }

  async function createStudentWithMandate(
    token: string,
    overrides: Record<string, unknown> = {},
  ): Promise<string> {
    const res = await http()
      .post('/students')
      .set(bearer(token))
      .send({
        firstName: 'Ana',
        lastName: 'García',
        iban: 'ES7921000813610123456789',
        mandateReference: 'MND-001',
        mandateDate: '2026-01-15',
        ...overrides,
      })
      .expect(201);
    return res.body.id;
  }

  async function createInvoice(
    token: string,
    studentId: string,
    amount: number,
    issueDate: string,
  ): Promise<string> {
    const res = await http()
      .post('/invoices')
      .set(bearer(token))
      .send({ studentId, amount, issueDate, description: 'Mensualidad' })
      .expect(201);
    return res.body.id;
  }

  it('previews a remittance with included and skipped invoices', async () => {
    await setCreditorConfig(acmeToken);
    const withMandate = await createStudentWithMandate(acmeToken);
    const noMandate = await http()
      .post('/students')
      .set(bearer(acmeToken))
      .send({ firstName: 'Sin', lastName: 'Mandato' })
      .expect(201);

    await createInvoice(acmeToken, withMandate, 50, '2026-10-05');
    await createInvoice(acmeToken, noMandate.body.id, 30, '2026-10-06');

    const res = await http()
      .post('/billing/sepa-remittance/preview')
      .set(bearer(acmeToken))
      .send({ month: 10, year: 2026 })
      .expect(201);

    expect(res.body.count).toBe(1);
    expect(res.body.totalAmount).toBe('50.00');
    expect(res.body.included).toHaveLength(1);
    expect(res.body.included[0].studentName).toBe('Ana García');
    expect(res.body.skipped).toHaveLength(1);
    expect(res.body.skipped[0].reason).toMatch(/mandato/i);
  });

  it('only includes the pending amount of partially paid invoices', async () => {
    await setCreditorConfig(acmeToken);
    const student = await createStudentWithMandate(acmeToken);
    const invoiceId = await createInvoice(acmeToken, student, 100, '2026-10-05');
    await http()
      .post(`/invoices/${invoiceId}/payments`)
      .set(bearer(acmeToken))
      .send({ amount: 40 })
      .expect(201);

    const res = await http()
      .post('/billing/sepa-remittance/preview')
      .set(bearer(acmeToken))
      .send({ month: 10, year: 2026 })
      .expect(201);

    expect(res.body.count).toBe(1);
    expect(res.body.totalAmount).toBe('60.00');
    expect(res.body.included[0].amount).toBe('60.00');
  });

  it('generates a valid pain.008 XML file', async () => {
    await setCreditorConfig(acmeToken);
    const student = await createStudentWithMandate(acmeToken);
    await createInvoice(acmeToken, student, 75, '2026-10-05');

    const res = await http()
      .post('/billing/sepa-remittance')
      .set(bearer(acmeToken))
      .send({ month: 10, year: 2026, collectionDate: '2026-11-01' })
      .buffer(true)
      .parse((response, cb) => {
        let data = '';
        response.on('data', (c: Buffer) => (data += c.toString()));
        response.on('end', () => cb(null, data));
      })
      .expect(201);

    expect(res.headers['content-type']).toMatch(/application\/xml/);
    expect(res.headers['content-disposition']).toMatch(
      /remesa-sepa-2026-10\.xml/,
    );
    const xml: string = res.body;
    expect(xml).toContain('pain.008.001.02');
    expect(xml).toContain('<CtrlSum>75.00</CtrlSum>');
    expect(xml).toContain('<NbOfTxs>1</NbOfTxs>');
    expect(xml).toContain('ES9121000418450200051332'); // creditor IBAN
    expect(xml).toContain('ES7921000813610123456789'); // debtor IBAN
    expect(xml).toContain('<MndtId>MND-001</MndtId>');
    expect(xml).toContain('<ReqdColltnDt>2026-11-01</ReqdColltnDt>');
  });

  it('rejects generation when creditor config is missing', async () => {
    const student = await createStudentWithMandate(acmeToken);
    await createInvoice(acmeToken, student, 50, '2026-10-05');

    await http()
      .post('/billing/sepa-remittance/preview')
      .set(bearer(acmeToken))
      .send({ month: 10, year: 2026 })
      .expect(400);
  });

  it('rejects generation when nothing is collectable', async () => {
    await setCreditorConfig(acmeToken);
    // student without mandate → invoice gets skipped → nothing to charge
    const noMandate = await http()
      .post('/students')
      .set(bearer(acmeToken))
      .send({ firstName: 'Sin', lastName: 'Mandato' })
      .expect(201);
    await createInvoice(acmeToken, noMandate.body.id, 30, '2026-10-06');

    await http()
      .post('/billing/sepa-remittance')
      .set(bearer(acmeToken))
      .send({ month: 10, year: 2026 })
      .expect(400);
  });

  it('isolates remittances between tenants', async () => {
    await setCreditorConfig(acmeToken);
    const acmeStudent = await createStudentWithMandate(acmeToken);
    await createInvoice(acmeToken, acmeStudent, 50, '2026-10-05');

    const beta = await seedTenant(prisma, {
      slug: 'beta',
      email: 'admin@beta.local',
      password: 'TestPassword123!',
    });
    const betaToken = await login(beta);
    await setCreditorConfig(betaToken);

    const res = await http()
      .post('/billing/sepa-remittance/preview')
      .set(bearer(betaToken))
      .send({ month: 10, year: 2026 })
      .expect(201);

    expect(res.body.count).toBe(0);
    expect(res.body.included).toHaveLength(0);
  });

  it('rejects unauthenticated requests with 401', async () => {
    await http()
      .post('/billing/sepa-remittance/preview')
      .send({ month: 10, year: 2026 })
      .expect(401);
    await http()
      .post('/billing/sepa-remittance')
      .send({ month: 10, year: 2026 })
      .expect(401);
  });
});
