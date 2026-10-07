const mockSend = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: mockSend } })),
}));

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapTestApp, resetDb, seedTenant, SeededTenant } from './setup-e2e';

describe('Returned SEPA receipts (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let acme: SeededTenant;
  let token: string;
  let ana: string;

  const OCT = { month: 10, year: 2026, collectionDate: '2026-10-05' };
  const REASON = 'AM04 — Fondos insuficientes';

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    mockSend.mockReset();
    mockSend.mockResolvedValue({ data: { id: 'email_1' }, error: null });
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
        name: 'Academia Acme',
        legalName: 'Acme Formación SL',
        contactEmail: 'secretaria@acme.es',
        iban: 'ES9121000418450200051332',
        sepaCreditorId: 'ES12ZZZB12345678',
      })
      .expect(200);
    ana = (
      await http()
        .post('/students')
        .set(auth())
        .send({
          firstName: 'Ana',
          lastName: 'García',
          iban: 'ES7921000813610123456789',
          mandateReference: 'MND-001',
          mandateDate: '2026-01-15',
        })
        .expect(201)
    ).body.id;
    await prisma.guardian.create({
      data: { studentId: ana, firstName: 'Marta', lastName: 'García', relationship: 'Madre', email: 'marta@example.com' },
    });
    await http()
      .post('/invoices')
      .set(auth())
      .send({ studentId: ana, amount: 55, issueDate: '2026-10-01T10:00:00Z', description: 'Mensualidad' })
      .expect(201);
  });

  function http() {
    return request(app.getHttpServer());
  }
  const auth = () => ({ Authorization: `Bearer ${token}` });

  /** Sends October's remittance (and optionally marks it collected); returns the receipt id. */
  async function remit(collect = true) {
    await http().post('/billing/sepa-remittance').set(auth()).send(OCT).expect(201);
    const [r] = (await http().get('/billing/remittances').set(auth())).body;
    if (collect) await http().post(`/billing/remittances/${r.id}/collect`).set(auth()).expect(200);
    const detail = await http().get(`/billing/remittances/${r.id}`).set(auth());
    return { remittanceId: r.id as string, itemId: detail.body.items[0].id as string };
  }
  const theInvoice = () =>
    prisma.invoice.findFirstOrThrow({ where: { description: 'Mensualidad' }, include: { payments: true } });

  it('undoes the direct-debit payment: the invoice is owed again', async () => {
    const { itemId, remittanceId } = await remit();
    expect((await theInvoice()).status).toBe('PAID');

    const res = await http()
      .post(`/billing/remittance-items/${itemId}/return`)
      .set(auth())
      .send({ reason: REASON })
      .expect(200);
    expect(res.body).toMatchObject({ feeInvoice: null, notified: false });
    expect(['PENDING', 'OVERDUE']).toContain(res.body.invoiceStatus);

    const inv = await theInvoice();
    expect(inv.paidAmount.toString()).toBe('0');
    expect(inv.payments).toHaveLength(0);

    const detail = await http().get(`/billing/remittances/${remittanceId}`).set(auth());
    expect(detail.body.items[0]).toMatchObject({ status: 'RETURNED', returnReason: REASON });
    const list = await http().get('/billing/remittances').set(auth());
    expect(list.body[0].returned).toBe(1);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('a returned receipt can go into a new remittance', async () => {
    const { itemId } = await remit();
    await http().post(`/billing/remittance-items/${itemId}/return`).set(auth()).send({ reason: REASON }).expect(200);
    const preview = await http().post('/billing/sepa-remittance/preview').set(auth()).send(OCT).expect(201);
    expect(preview.body.included).toHaveLength(1);
  });

  it('passes the bank fee on to the family and emails them', async () => {
    const { itemId } = await remit();
    const res = await http()
      .post(`/billing/remittance-items/${itemId}/return`)
      .set(auth())
      .send({ reason: REASON, bankFee: 3.5, chargeFee: true, notifyFamily: true })
      .expect(200);
    expect(res.body.feeInvoice).toMatchObject({ amount: '3.5' });
    expect(res.body.notified).toBe(true);

    const fee = await prisma.invoice.findUniqueOrThrow({ where: { id: res.body.feeInvoice.id } });
    expect(fee.description).toMatch(/^Comisión por devolución del recibo F-/);
    expect(fee.hash).toBeTruthy();

    const mail = mockSend.mock.calls[0][0];
    expect(mail.to).toEqual(['marta@example.com']);
    expect(mail.subject).toMatch(/^Recibo devuelto — Factura F-/);
    expect(mail.replyTo).toBe('secretaria@acme.es');
    expect(mail.html).toContain('55,00');
    expect(mail.html).toContain('3,50');
  });

  it('a bank fee without chargeFee is not invoiced', async () => {
    const { itemId } = await remit();
    const res = await http()
      .post(`/billing/remittance-items/${itemId}/return`)
      .set(auth())
      .send({ reason: REASON, bankFee: 3.5 })
      .expect(200);
    expect(res.body.feeInvoice).toBeNull();
    expect(await prisma.invoice.count()).toBe(1);
  });

  it('works before marking the remittance collected, and only once', async () => {
    const { itemId } = await remit(false);
    await http().post(`/billing/remittance-items/${itemId}/return`).set(auth()).send({ reason: REASON }).expect(200);
    expect((await theInvoice()).payments).toHaveLength(0);
    await http().post(`/billing/remittance-items/${itemId}/return`).set(auth()).send({ reason: REASON }).expect(400);
  });

  it('a failed email does not undo the return', async () => {
    mockSend.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    const { itemId } = await remit();
    const res = await http()
      .post(`/billing/remittance-items/${itemId}/return`)
      .set(auth())
      .send({ reason: REASON, notifyFamily: true })
      .expect(200);
    expect(res.body.notified).toBe(false);
    expect((await theInvoice()).payments).toHaveLength(0);
  });

  it('validates and is private to each academy', async () => {
    const { itemId } = await remit();
    await http().post(`/billing/remittance-items/${itemId}/return`).set(auth()).send({}).expect(400);
    await seedTenant(prisma, { slug: 'other', email: 'admin@other.local', password: 'TestPassword123!' });
    const res = await http()
      .post('/auth/login')
      .send({ tenantSlug: 'other', email: 'admin@other.local', password: 'TestPassword123!' })
      .expect(200);
    await http()
      .post(`/billing/remittance-items/${itemId}/return`)
      .set({ Authorization: `Bearer ${res.body.accessToken}` })
      .send({ reason: REASON })
      .expect(404);
  });
});
