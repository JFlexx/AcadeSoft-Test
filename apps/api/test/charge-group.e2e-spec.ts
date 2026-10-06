import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapTestApp, resetDb, seedTenant, SeededTenant } from './setup-e2e';

describe('Charge a concept to a group (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let acme: SeededTenant;
  let admin: string;
  let groupId: string;

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
    groupId = (await prisma.group.create({ data: { tenantId: t, courseId: course.id, name: 'B1' } })).id;
    const mk = (firstName: string, discountPercent?: number) =>
      prisma.student.create({
        data: { tenantId: t, firstName, lastName: 'Ruiz', discountPercent },
      });
    const ana = await mk('Ana', 15); // sibling discount: not applied to concepts
    const bea = await mk('Bea');
    const dani = await mk('Dani');
    await prisma.enrollment.createMany({
      data: [
        { studentId: ana.id, groupId },
        { studentId: bea.id, groupId },
        { studentId: dani.id, groupId, status: 'DROPPED' },
      ],
    });
  });

  function http() {
    return request(app.getHttpServer());
  }
  const auth = () => ({ Authorization: `Bearer ${admin}` });
  const charge = (body: Record<string, unknown>) =>
    http()
      .post('/billing/charge-group')
      .set(auth())
      .send({ groupId, description: 'Libro B1', amount: 25, ...body });

  it('previews without creating anything', async () => {
    const res = await charge({ dryRun: true }).expect(201);
    expect(res.body.summary).toEqual({ created: 0, wouldCreate: 2, skipped: 0, total: '50.00' });
    expect(await prisma.invoice.count()).toBe(0);
  });

  it('creates one chained invoice per active student, same amount for all', async () => {
    const res = await charge({ dueDate: '2026-11-15T12:00:00.000Z' }).expect(201);
    expect(res.body.summary).toMatchObject({ created: 2, skipped: 0, total: '50.00' });
    expect(res.body.items.map((i: { studentName: string }) => i.studentName)).toEqual([
      'Ana Ruiz',
      'Bea Ruiz',
    ]);

    const invoices = await prisma.invoice.findMany({ orderBy: { number: 'asc' } });
    expect(invoices).toHaveLength(2);
    for (const inv of invoices) {
      expect(inv.description).toBe('Libro B1');
      expect(inv.amount.toString()).toBe('25');
      expect(inv.billingPeriod).toBeNull();
      expect(inv.hash).toBeTruthy();
      expect(inv.dueDate!.toISOString()).toBe('2026-11-15T12:00:00.000Z');
    }
    // Chained: the second one points at the first.
    expect(invoices[1].previousHash).toBe(invoices[0].hash);
  });

  it('re-submitting the same concept the same day does not charge twice', async () => {
    await charge({}).expect(201);
    const again = await charge({}).expect(201);
    expect(again.body.summary).toMatchObject({ created: 0, skipped: 2, total: '0.00' });
    expect(await prisma.invoice.count()).toBe(2);

    // A different concept (or amount) is a new charge.
    const other = await charge({ description: 'Excursión museo', amount: 12 }).expect(201);
    expect(other.body.summary.created).toBe(2);
  });

  it('validates the request', async () => {
    await charge({ amount: 0 }).expect(400);
    await charge({ description: '   ' }).expect(400);
    await http()
      .post('/billing/charge-group')
      .set(auth())
      .send({ groupId: 'nope', description: 'X', amount: 5 })
      .expect(404);

    await prisma.enrollment.updateMany({ where: { groupId }, data: { status: 'DROPPED' } });
    const empty = await charge({}).expect(400);
    expect(empty.body.message).toMatch(/alumnos activos/);
  });

  it("can't charge another academy's group", async () => {
    await seedTenant(prisma, { slug: 'other', email: 'admin@other.local', password: 'TestPassword123!' });
    const res = await http()
      .post('/auth/login')
      .send({ tenantSlug: 'other', email: 'admin@other.local', password: 'TestPassword123!' })
      .expect(200);
    await http()
      .post('/billing/charge-group')
      .set({ Authorization: `Bearer ${res.body.accessToken}` })
      .send({ groupId, description: 'Libro', amount: 25 })
      .expect(404);
  });
});
