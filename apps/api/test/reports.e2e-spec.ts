import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapTestApp, resetDb, seedTenant, SeededTenant } from './setup-e2e';

const DAY = 86_400_000;

describe('Reports (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let acme: SeededTenant;
  let admin: string;

  const RANGE = { from: '2026-10-01', to: '2026-11-30' };

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
    admin = res.body.accessToken;

    const t = acme.tenantId;
    const course = await prisma.course.create({ data: { tenantId: t, name: 'Inglés' } });
    const b1 = await prisma.group.create({ data: { tenantId: t, courseId: course.id, name: 'B1' } });
    const a2 = await prisma.group.create({ data: { tenantId: t, courseId: course.id, name: 'A2' } });
    const ana = await prisma.student.create({ data: { tenantId: t, firstName: 'Ana', lastName: 'Ruiz' } });
    const bea = await prisma.student.create({ data: { tenantId: t, firstName: 'Bea', lastName: 'Sol' } });
    const anaB1 = await prisma.enrollment.create({
      data: { studentId: ana.id, groupId: b1.id, enrolledAt: new Date('2026-10-03T10:00:00Z') },
    });
    await prisma.enrollment.create({
      data: {
        studentId: bea.id,
        groupId: a2.id,
        status: 'DROPPED',
        enrolledAt: new Date('2026-09-20T10:00:00Z'),
        droppedAt: new Date('2026-11-05T10:00:00Z'),
      },
    });

    let n = 0;
    const invoice = (data: Record<string, unknown>) =>
      prisma.invoice.create({
        data: { tenantId: t, number: `F-2026-${String(++n).padStart(4, '0')}`, ...data } as never,
      });
    const now = Date.now();
    const inv1 = await invoice({
      studentId: ana.id,
      enrollmentId: anaB1.id,
      billingPeriod: '2026-10',
      amount: 55,
      paidAmount: 55,
      status: 'PAID',
      issueDate: new Date('2026-10-01T10:00:00Z'),
    });
    const inv2 = await invoice({
      studentId: ana.id,
      enrollmentId: anaB1.id,
      billingPeriod: '2026-11',
      amount: 55,
      paidAmount: 20,
      status: 'PARTIAL',
      issueDate: new Date('2026-11-01T10:00:00Z'),
      dueDate: new Date(now - 10 * DAY), // overdue 0–30
    });
    await invoice({
      studentId: bea.id,
      amount: 30,
      status: 'OVERDUE',
      description: 'Libro A2',
      issueDate: new Date('2026-10-15T10:00:00Z'),
      dueDate: new Date(now - 45 * DAY), // overdue 31–60
    });
    await invoice({
      studentId: bea.id,
      amount: 99,
      status: 'CANCELLED',
      issueDate: new Date('2026-10-20T10:00:00Z'),
    });
    await invoice({
      studentId: bea.id,
      amount: 70,
      status: 'PENDING',
      issueDate: new Date('2026-12-01T10:00:00Z'), // outside the period
      dueDate: new Date(now + 10 * DAY), // not due yet
    });
    await prisma.payment.createMany({
      data: [
        { tenantId: t, invoiceId: inv1.id, amount: 55, method: 'DIRECT_DEBIT', paidAt: new Date('2026-10-05T10:00:00Z') },
        { tenantId: t, invoiceId: inv2.id, amount: 20, method: 'CASH', paidAt: new Date('2026-11-10T10:00:00Z') },
      ],
    });

    let d = 10;
    for (const status of ['PRESENT', 'ABSENT'] as const) {
      const s = await prisma.session.create({
        data: { tenantId: t, groupId: b1.id, scheduledAt: new Date(`2026-10-${d}T16:00:00Z`) },
      });
      d += 7;
      await prisma.attendance.create({ data: { sessionId: s.id, studentId: ana.id, status } });
    }
  });

  function http() {
    return request(app.getHttpServer());
  }
  const auth = () => ({ Authorization: `Bearer ${admin}` });

  it('income: invoiced and collected, by month and by group (cancelled excluded)', async () => {
    const { body } = await http().get('/reports/overview').query(RANGE).set(auth()).expect(200);
    expect(body.income).toMatchObject({
      invoiced: '140.00',
      collected: '75.00',
      byMonth: [
        { month: '2026-10', invoiced: '85.00', collected: '55.00' },
        { month: '2026-11', invoiced: '55.00', collected: '20.00' },
      ],
      byGroup: [{ name: 'B1', course: 'Inglés', invoiced: '110.00', collected: '75.00' }],
      other: { invoiced: '30.00', collected: '0.00' },
    });
  });

  it('receivables: what is owed today, by age, and who owes most', async () => {
    const { body } = await http().get('/reports/overview').query(RANGE).set(auth()).expect(200);
    expect(body.receivables).toMatchObject({
      pending: '135.00',
      overdue: '65.00',
      aging: { notDue: '70.00', d0_30: '35.00', d31_60: '30.00', d60plus: '0.00' },
    });
    expect(body.receivables.topDebtors.map((x: { name: string; pending: string }) => [x.name, x.pending])).toEqual([
      ['Bea Sol', '100.00'],
      ['Ana Ruiz', '35.00'],
    ]);
  });

  it('students and attendance', async () => {
    const { body } = await http().get('/reports/overview').query(RANGE).set(auth()).expect(200);
    expect(body.students).toEqual({
      active: 1,
      joined: 1,
      left: 1,
      byMonth: [
        { month: '2026-10', joined: 1, left: 0 },
        { month: '2026-11', joined: 0, left: 1 },
      ],
    });
    expect(body.attendance).toEqual([{ name: 'B1', attended: 1, marked: 2, rate: 50 }]);
  });

  it('invoice book and payments for the accountant', async () => {
    const book = await http().get('/reports/invoice-book').query(RANGE).set(auth()).expect(200);
    expect(book.body.map((r: { number: string; status: string }) => [r.number, r.status])).toEqual([
      ['F-2026-0001', 'PAID'],
      ['F-2026-0002', 'PARTIAL'],
      ['F-2026-0003', 'OVERDUE'],
      ['F-2026-0004', 'CANCELLED'], // the book lists every issued invoice
    ]);
    expect(book.body[0]).toMatchObject({ issueDate: '2026-10-01', customer: 'Ana Ruiz', amount: '55.00', paid: '55.00' });

    const pay = await http().get('/reports/payments').query(RANGE).set(auth()).expect(200);
    expect(pay.body).toEqual([
      { date: '2026-10-05', invoice: 'F-2026-0001', customer: 'Ana Ruiz', method: 'DIRECT_DEBIT', amount: '55.00', reference: null },
      { date: '2026-11-10', invoice: 'F-2026-0002', customer: 'Ana Ruiz', method: 'CASH', amount: '20.00', reference: null },
    ]);
  });

  it('validates the period, admin only, private to each academy', async () => {
    await http().get('/reports/overview').query({ from: '2026-11-30', to: '2026-10-01' }).set(auth()).expect(400);
    await http().get('/reports/overview').query({ from: '2026-02-30', to: '2026-03-01' }).set(auth()).expect(400);
    await http().get('/reports/overview').query({ from: '2020-01-01', to: '2026-12-31' }).set(auth()).expect(400);

    await seedTenant(prisma, { slug: 'other', email: 'admin@other.local', password: 'TestPassword123!' });
    const res = await http()
      .post('/auth/login')
      .send({ tenantSlug: 'other', email: 'admin@other.local', password: 'TestPassword123!' })
      .expect(200);
    const other = await http()
      .get('/reports/overview')
      .query(RANGE)
      .set({ Authorization: `Bearer ${res.body.accessToken}` })
      .expect(200);
    expect(other.body.income.invoiced).toBe('0.00');
    expect(other.body.receivables.topDebtors).toEqual([]);
  });
});
