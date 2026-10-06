import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapTestApp, resetDb, seedTenant, SeededTenant } from './setup-e2e';

type Item = { studentName: string; amount: string | null; status: string; note: string | null };

describe('Proration of the first monthly fee (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let acme: SeededTenant;
  let admin: string;
  let withClasses: string; // 8 classes in November (+1 cancelled)
  let noClasses: string;

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
    const t = acme.tenantId;
    await prisma.tenant.update({ where: { id: t }, data: { prorateNewEnrollments: true } });
    const res = await http()
      .post('/auth/login')
      .send({ tenantSlug: 'acme', email: 'admin@acme.local', password: 'TestPassword123!' })
      .expect(200);
    admin = res.body.accessToken;

    const course = await prisma.course.create({ data: { tenantId: t, name: 'Inglés' } });
    withClasses = (
      await prisma.group.create({ data: { tenantId: t, courseId: course.id, name: 'B1', monthlyFee: 80 } })
    ).id;
    noClasses = (
      await prisma.group.create({ data: { tenantId: t, courseId: course.id, name: 'A2', monthlyFee: 60 } })
    ).id;
    // Tue/Thu 17:00 Madrid (16:00Z in November): 8 classes.
    for (const d of ['03', '05', '10', '12', '17', '19', '24', '26']) {
      await prisma.session.create({
        data: { tenantId: t, groupId: withClasses, scheduledAt: new Date(`2026-11-${d}T16:00:00Z`) },
      });
    }
    // A holiday-cancelled class doesn't count.
    await prisma.session.create({
      data: {
        tenantId: t,
        groupId: withClasses,
        scheduledAt: new Date('2026-11-06T16:00:00Z'),
        status: 'CANCELLED',
      },
    });
  });

  function http() {
    return request(app.getHttpServer());
  }
  const auth = () => ({ Authorization: `Bearer ${admin}` });

  async function enroll(name: string, groupId: string, enrolledAt: string, discountPercent?: number) {
    const s = await prisma.student.create({
      data: { tenantId: acme.tenantId, firstName: name, lastName: 'X', discountPercent },
    });
    await prisma.enrollment.create({
      data: { studentId: s.id, groupId, enrolledAt: new Date(enrolledAt) },
    });
  }
  async function preview(): Promise<Record<string, Item>> {
    const res = await http()
      .post('/billing/generate-month')
      .set(auth())
      .send({ month: 11, year: 2026, dryRun: true })
      .expect(201);
    return Object.fromEntries(
      res.body.results.map((r: Item) => [r.studentName.split(' ')[0], r]),
    );
  }

  it('charges the full fee to whoever was already enrolled or joined on the 1st', async () => {
    await enroll('Antes', withClasses, '2026-10-20T10:00:00Z');
    await enroll('Uno', withClasses, '2026-11-01T09:00:00Z');
    const r = await preview();
    expect(r.Antes).toMatchObject({ amount: '80', note: null });
    expect(r.Uno).toMatchObject({ amount: '80', note: null });
  });

  it('prorates by the classes left from the day they joined', async () => {
    await enroll('Mitad', withClasses, '2026-11-11T10:00:00Z');
    const r = await preview();
    // Left: 12, 17, 19, 24, 26 → 5 of 8.
    expect(r.Mitad).toMatchObject({
      amount: '50',
      status: 'WOULD_CREATE',
      note: 'Prorrateo: 5 de 8 clases del mes (alta el 11/11)',
    });
  });

  it('a class later the same day still counts (local day)', async () => {
    await enroll('Mismo', withClasses, '2026-11-12T08:00:00Z'); // morning of the 12th
    const r = await preview();
    expect(r.Mismo.note).toBe('Prorrateo: 5 de 8 clases del mes (alta el 12/11)');
  });

  it('nothing to charge after the last class of the month', async () => {
    await enroll('Tarde', withClasses, '2026-11-27T10:00:00Z');
    const r = await preview();
    expect(r.Tarde).toMatchObject({ amount: null, status: 'NO_FEE' });
  });

  it('without classes on the calendar, prorates by days', async () => {
    await enroll('Dias', noClasses, '2026-11-16T10:00:00Z');
    const r = await preview();
    // 30 - 16 + 1 = 15 of 30 days.
    expect(r.Dias).toMatchObject({
      amount: '30',
      note: 'Prorrateo: 15 de 30 días del mes (alta el 16/11)',
    });
  });

  it('combines with the sibling discount, and stores the explanation', async () => {
    await enroll('Herm', withClasses, '2026-11-11T10:00:00Z', 10);
    const r = await preview();
    // 80 × 0.9 = 72; × 5/8 = 45.
    expect(r.Herm.amount).toBe('45');
    expect(r.Herm.note).toBe(
      'Descuento 10% sobre cuota base 80.00 € · Prorrateo: 5 de 8 clases del mes (alta el 11/11)',
    );

    await http().post('/billing/generate-month').set(auth()).send({ month: 11, year: 2026 }).expect(201);
    const inv = await prisma.invoice.findFirstOrThrow({ where: { billingPeriod: '2026-11' } });
    expect(inv.amount.toString()).toBe('45');
    expect(inv.notes).toContain('Prorrateo: 5 de 8 clases');
  });

  it('is off unless the academy enables it', async () => {
    await prisma.tenant.update({ where: { id: acme.tenantId }, data: { prorateNewEnrollments: false } });
    await enroll('Mitad', withClasses, '2026-11-11T10:00:00Z');
    const r = await preview();
    expect(r.Mitad).toMatchObject({ amount: '80', note: null });

    const s = await http().patch('/settings').set(auth()).send({ prorateNewEnrollments: true }).expect(200);
    expect(s.body.prorateNewEnrollments).toBe(true);
  });

  it('approving a request starts the enrollment that day', async () => {
    const st = await prisma.student.create({ data: { tenantId: acme.tenantId, firstName: 'P', lastName: 'X' } });
    const e = await prisma.enrollment.create({
      data: { studentId: st.id, groupId: withClasses, status: 'PENDING', enrolledAt: new Date('2026-01-01') },
    });
    const res = await http().patch(`/enrollments/${e.id}`).set(auth()).send({ status: 'ACTIVE' }).expect(200);
    expect(new Date(res.body.enrolledAt).getFullYear()).toBeGreaterThanOrEqual(2026);
    expect(new Date(res.body.enrolledAt).getTime()).toBeGreaterThan(new Date('2026-01-02').getTime());
  });
});
