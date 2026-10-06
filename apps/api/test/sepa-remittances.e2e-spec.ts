import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapTestApp, resetDb, seedTenant, SeededTenant } from './setup-e2e';

describe('SEPA remittance history (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let acme: SeededTenant;
  let token: string;
  let ana: string;
  let bea: string;

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
    const res = await http()
      .post('/auth/login')
      .send({ tenantSlug: 'acme', email: 'admin@acme.local', password: 'TestPassword123!' })
      .expect(200);
    token = res.body.accessToken;
    await http()
      .patch('/settings')
      .set(auth())
      .send({
        legalName: 'Acme Formación SL',
        iban: 'ES9121000418450200051332',
        sepaCreditorId: 'ES12ZZZB12345678',
      })
      .expect(200);
    const student = async (firstName: string, mandate: string) =>
      (
        await http()
          .post('/students')
          .set(auth())
          .send({
            firstName,
            lastName: 'García',
            iban: 'ES7921000813610123456789',
            mandateReference: mandate,
            mandateDate: '2026-01-15',
          })
          .expect(201)
      ).body.id as string;
    ana = await student('Ana', 'MND-001');
    bea = await student('Bea', 'MND-002');
    await invoice(ana, 55);
    await invoice(bea, 40);
  });

  function http() {
    return request(app.getHttpServer());
  }
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const OCT = { month: 10, year: 2026, collectionDate: '2026-10-05' };

  function invoice(studentId: string, amount: number) {
    return http()
      .post('/invoices')
      .set(auth())
      .send({ studentId, amount, issueDate: '2026-10-01T10:00:00Z', description: 'Mensualidad' })
      .expect(201);
  }
  async function download() {
    const res = await http().post('/billing/sepa-remittance').set(auth()).send(OCT).expect(201);
    return res.text;
  }

  it('records the remittance when the XML is downloaded', async () => {
    const xml = await download();
    const list = await http().get('/billing/remittances').set(auth()).expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ period: '2026-10', itemCount: 2, total: '95', status: 'SENT' });

    const detail = await http().get(`/billing/remittances/${list.body[0].id}`).set(auth()).expect(200);
    expect(detail.body.items.map((i: { status: string }) => i.status)).toEqual(['SENT', 'SENT']);

    // The stored XML is the one that was sent.
    const again = await http().get(`/billing/remittances/${list.body[0].id}/xml`).set(auth()).expect(200);
    expect(again.text).toBe(xml);
    expect(again.headers['content-disposition']).toContain('remesa-sepa-2026-10.xml');
  });

  it('never sends a receipt twice while it is pending at the bank', async () => {
    await download();
    const preview = await http().post('/billing/sepa-remittance/preview').set(auth()).send(OCT).expect(201);
    expect(preview.body.included).toHaveLength(0);
    expect(preview.body.skipped.map((s: { reason: string }) => s.reason)).toEqual([
      expect.stringMatching(/Ya está en la remesa del .*pendiente de cobro/),
      expect.stringMatching(/Ya está en la remesa del .*pendiente de cobro/),
    ]);
    await http().post('/billing/sepa-remittance').set(auth()).send(OCT).expect(400);

    // A new invoice of the same month does go into a second remittance.
    const cleo = await prisma.student.findFirstOrThrow({ where: { id: ana } });
    await invoice(cleo.id, 12);
    await download();
    const list = await http().get('/billing/remittances').set(auth()).expect(200);
    expect(list.body.map((r: { itemCount: number }) => r.itemCount)).toEqual([1, 2]);
  });

  it('marking it collected registers a direct-debit payment per receipt', async () => {
    await download();
    const [r] = (await http().get('/billing/remittances').set(auth())).body;
    const res = await http().post(`/billing/remittances/${r.id}/collect`).set(auth()).expect(200);
    expect(res.body).toEqual({ registered: 2 });

    const invoices = await prisma.invoice.findMany({ include: { payments: true }, orderBy: { number: 'asc' } });
    for (const inv of invoices) {
      expect(inv.status).toBe('PAID');
      expect(inv.payments).toHaveLength(1);
      expect(inv.payments[0]).toMatchObject({ method: 'DIRECT_DEBIT' });
      expect(inv.payments[0].paidAt.toISOString().slice(0, 10)).toBe('2026-10-05');
    }
    const detail = await http().get(`/billing/remittances/${r.id}`).set(auth());
    expect(detail.body.status).toBe('COLLECTED');
    expect(detail.body.items.every((i: { status: string }) => i.status === 'COLLECTED')).toBe(true);

    // Idempotent.
    const again = await http().post(`/billing/remittances/${r.id}/collect`).set(auth()).expect(200);
    expect(again.body).toEqual({ registered: 0 });
    expect(await prisma.payment.count()).toBe(2);
  });

  it('never registers more than the invoice still owes', async () => {
    await download();
    // Paid 20 € in cash meanwhile.
    const inv = await prisma.invoice.findFirstOrThrow({ where: { studentId: ana } });
    await http()
      .post(`/invoices/${inv.id}/payments`)
      .set(auth())
      .send({ amount: 20, method: 'CASH' })
      .expect(201);
    const [r] = (await http().get('/billing/remittances').set(auth())).body;
    await http().post(`/billing/remittances/${r.id}/collect`).set(auth()).expect(200);
    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id }, include: { payments: true } });
    expect(after.paidAmount.toString()).toBe('55');
    expect(after.payments.find((p) => p.method === 'DIRECT_DEBIT')!.amount.toString()).toBe('35');
  });

  it('a remittance that never reached the bank can be voided', async () => {
    await download();
    const [r] = (await http().get('/billing/remittances').set(auth())).body;
    await http().delete(`/billing/remittances/${r.id}`).set(auth()).expect(204);
    const preview = await http().post('/billing/sepa-remittance/preview').set(auth()).send(OCT).expect(201);
    expect(preview.body.included).toHaveLength(2);

    await download();
    const [r2] = (await http().get('/billing/remittances').set(auth())).body;
    await http().post(`/billing/remittances/${r2.id}/collect`).set(auth()).expect(200);
    await http().delete(`/billing/remittances/${r2.id}`).set(auth()).expect(400);
  });

  it("is private to each academy", async () => {
    await download();
    const [r] = (await http().get('/billing/remittances').set(auth())).body;
    await seedTenant(prisma, { slug: 'other', email: 'admin@other.local', password: 'TestPassword123!' });
    const res = await http()
      .post('/auth/login')
      .send({ tenantSlug: 'other', email: 'admin@other.local', password: 'TestPassword123!' })
      .expect(200);
    const other = { Authorization: `Bearer ${res.body.accessToken}` };
    expect((await http().get('/billing/remittances').set(other)).body).toEqual([]);
    await http().get(`/billing/remittances/${r.id}`).set(other).expect(404);
    await http().post(`/billing/remittances/${r.id}/collect`).set(other).expect(404);
  });
});
