import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapTestApp, resetDb, seedTenant, SeededTenant } from './setup-e2e';

describe('Enrollment fee / matrícula (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let acme: SeededTenant;
  let admin: string;
  let feeGroup: string; // matrícula 30 €, cuota 55 €
  let freeGroup: string; // sin matrícula
  let ana: string;

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
    const course = await http().post('/courses').set(auth()).send({ name: 'Inglés' }).expect(201);
    feeGroup = (
      await http()
        .post('/groups')
        .set(auth())
        .send({ courseId: course.body.id, name: 'B1', monthlyFee: 55, enrollmentFee: 30 })
        .expect(201)
    ).body.id;
    freeGroup = (
      await http()
        .post('/groups')
        .set(auth())
        .send({ courseId: course.body.id, name: 'A2', monthlyFee: 50 })
        .expect(201)
    ).body.id;
    ana = (
      await prisma.student.create({
        data: { tenantId: acme.tenantId, firstName: 'Ana', lastName: 'Ruiz' },
      })
    ).id;
  });

  function http() {
    return request(app.getHttpServer());
  }
  const auth = () => ({ Authorization: `Bearer ${admin}` });
  const feeInvoices = () =>
    prisma.invoice.findMany({ where: { studentId: ana, billingPeriod: 'MATRICULA' } });

  it('charges the matrícula when the student is enrolled', async () => {
    const res = await http()
      .post('/enrollments')
      .set(auth())
      .send({ studentId: ana, groupId: feeGroup })
      .expect(201);
    expect(res.body.status).toBe('ACTIVE');
    expect(res.body.enrollmentFeeInvoice).toMatchObject({ amount: '30' });

    const [inv] = await feeInvoices();
    expect(inv).toMatchObject({
      enrollmentId: res.body.id,
      description: 'Matrícula — B1',
      status: 'PENDING',
    });
    expect(inv.hash).toBeTruthy(); // chained like any other invoice (Verifactu)
    expect(inv.dueDate!.getTime()).toBeGreaterThan(inv.issueDate.getTime());
  });

  it('can be skipped, and charged later only once', async () => {
    const res = await http()
      .post('/enrollments')
      .set(auth())
      .send({ studentId: ana, groupId: feeGroup, chargeEnrollmentFee: false })
      .expect(201);
    expect(res.body.enrollmentFeeInvoice).toBeNull();
    expect(await feeInvoices()).toHaveLength(0);

    const later = await http().post(`/enrollments/${res.body.id}/enrollment-fee`).set(auth()).expect(201);
    expect(later.body.enrollmentFeeInvoice.amount).toBe('30');
    await http().post(`/enrollments/${res.body.id}/enrollment-fee`).set(auth()).expect(409);
    expect(await feeInvoices()).toHaveLength(1);
  });

  it('groups without matrícula charge nothing', async () => {
    const res = await http()
      .post('/enrollments')
      .set(auth())
      .send({ studentId: ana, groupId: freeGroup })
      .expect(201);
    expect(res.body.enrollmentFeeInvoice).toBeNull();
    const manual = await http().post(`/enrollments/${res.body.id}/enrollment-fee`).set(auth()).expect(400);
    expect(manual.body.message).toMatch(/no tiene matrícula/);
  });

  it('a pending request is charged when approved, and never twice', async () => {
    const created = await http()
      .post('/enrollments')
      .set(auth())
      .send({ studentId: ana, groupId: feeGroup, status: 'PENDING' })
      .expect(201);
    expect(created.body.enrollmentFeeInvoice).toBeNull();

    const approved = await http()
      .patch(`/enrollments/${created.body.id}`)
      .set(auth())
      .send({ status: 'ACTIVE' })
      .expect(200);
    expect(approved.body.enrollmentFeeInvoice.amount).toBe('30');

    // Dropped and re-activated: no second matrícula.
    await http().patch(`/enrollments/${created.body.id}`).set(auth()).send({ status: 'DROPPED' }).expect(200);
    const again = await http()
      .patch(`/enrollments/${created.body.id}`)
      .set(auth())
      .send({ status: 'ACTIVE' })
      .expect(200);
    expect(again.body.enrollmentFeeInvoice).toBeNull();
    expect(await feeInvoices()).toHaveLength(1);

    // The list tells the UI it's already invoiced (so it won't ask again).
    const list = await http().get('/enrollments').query({ groupId: feeGroup }).set(auth()).expect(200);
    expect(list.body[0].enrollmentFeeInvoiced).toBe(true);

    // Editing something else of an active enrollment doesn't charge either.
    const edit = await http()
      .patch(`/enrollments/${created.body.id}`)
      .set(auth())
      .send({ notes: 'Prefiere los lunes' })
      .expect(200);
    expect(edit.body.enrollmentFeeInvoice).toBeNull();
  });

  it('giving a spot from the waiting list charges it (unless told not to)', async () => {
    const e = await prisma.enrollment.create({
      data: { studentId: ana, groupId: feeGroup, status: 'WAITLIST' },
    });
    const res = await http()
      .patch(`/enrollments/${e.id}`)
      .set(auth())
      .send({ status: 'ACTIVE', chargeEnrollmentFee: false })
      .expect(200);
    expect(res.body.enrollmentFeeInvoice).toBeNull();
    expect(await feeInvoices()).toHaveLength(0);
  });

  it('converting a trial class charges it; to the waiting list, it does not', async () => {
    const t = acme.tenantId;
    const mk = async (groupId: string) => {
      const s = await prisma.session.create({
        data: { tenantId: t, groupId, scheduledAt: new Date(Date.now() - 3600_000) },
      });
      return prisma.trialClass.create({ data: { tenantId: t, sessionId: s.id, studentId: ana } });
    };
    const trial = await mk(feeGroup);
    const res = await http().post(`/trials/${trial.id}/convert`).set(auth()).send({}).expect(200);
    expect(res.body.enrollmentFeeInvoice.amount).toBe('30');

    const bea = await prisma.student.create({ data: { tenantId: t, firstName: 'Bea', lastName: 'X' } });
    const s2 = await prisma.session.create({
      data: { tenantId: t, groupId: feeGroup, scheduledAt: new Date(Date.now() - 7200_000) },
    });
    const trial2 = await prisma.trialClass.create({ data: { tenantId: t, sessionId: s2.id, studentId: bea.id } });
    const wl = await http()
      .post(`/trials/${trial2.id}/convert`)
      .set(auth())
      .send({ status: 'WAITLIST' })
      .expect(200);
    expect(wl.body.enrollmentFeeInvoice).toBeNull();
  });

  it('monthly billing is independent of the matrícula', async () => {
    await http().post('/enrollments').set(auth()).send({ studentId: ana, groupId: feeGroup }).expect(201);
    const gen = await http()
      .post('/billing/generate-month')
      .set(auth())
      .send({ month: 11, year: 2026 })
      .expect(201);
    expect(gen.body.summary.created).toBe(1);
    const all = await prisma.invoice.findMany({ where: { studentId: ana }, orderBy: { number: 'asc' } });
    expect(all.map((i) => [i.billingPeriod, i.amount.toString()])).toEqual([
      ['MATRICULA', '30'],
      ['2026-11', '55'],
    ]);
  });

  it('the matrícula is set and cleared on the group', async () => {
    const g = await http().get(`/groups/${feeGroup}`).set(auth()).expect(200);
    expect(g.body.enrollmentFee).toBe('30');
    const cleared = await http()
      .patch(`/groups/${feeGroup}`)
      .set(auth())
      .send({ enrollmentFee: null })
      .expect(200);
    expect(cleared.body.enrollmentFee).toBeNull();
    await http().patch(`/groups/${feeGroup}`).set(auth()).send({ enrollmentFee: -5 }).expect(400);
  });
});
