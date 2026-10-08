import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { todayIn, zonedToUtc } from '../src/class-schedule/zoned-time';
import { bootstrapTestApp, resetDb, seedTenant, SeededTenant } from './setup-e2e';

const DAY = 86_400_000;

describe('Home "qué hacer hoy" (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let acme: SeededTenant;
  let admin: string;

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
  });

  function http() {
    return request(app.getHttpServer());
  }

  async function today() {
    const res = await http()
      .get('/reports/today')
      .set({ Authorization: `Bearer ${admin}` })
      .expect(200);
    return res.body;
  }

  it('lists today, unmarked classes, trials to follow up, free spots and returned receipts', async () => {
    const t = acme.tenantId;
    const now = Date.now();
    const course = await prisma.course.create({ data: { tenantId: t, name: 'Inglés' } });
    const b1 = await prisma.group.create({
      data: { tenantId: t, courseId: course.id, name: 'B1', maxCapacity: 2 },
    });
    const empty = await prisma.group.create({
      data: { tenantId: t, courseId: course.id, name: 'Vacío' },
    });
    const student = (firstName: string) =>
      prisma.student.create({ data: { tenantId: t, firstName, lastName: 'Test' } });
    const [ana, bea, carla] = await Promise.all([student('Ana'), student('Bea'), student('Carla')]);
    await prisma.enrollment.create({ data: { studentId: ana.id, groupId: b1.id } });
    await prisma.enrollment.create({
      data: { studentId: bea.id, groupId: b1.id, status: 'WAITLIST' },
    });

    const session = (groupId: string, at: number, extra: Record<string, unknown> = {}) =>
      prisma.session.create({
        data: { tenantId: t, groupId, scheduledAt: new Date(at), durationMinutes: 60, ...extra },
      });
    const unmarked = await session(b1.id, now - 3 * DAY);
    const marked = await session(b1.id, now - 2 * DAY);
    await prisma.attendance.create({ data: { sessionId: marked.id, studentId: ana.id } });
    const cancelled = await session(b1.id, now - DAY, { status: 'CANCELLED' });
    const noStudents = await session(empty.id, now - DAY);
    const tooOld = await session(b1.id, now - 20 * DAY);
    const madridDay = todayIn('Europe/Madrid');
    const todayClass = await session(
      b1.id,
      zonedToUtc(madridDay, '12:00', 'Europe/Madrid').getTime(),
    );

    // Trials: one already happened (to call back), one still to come, one done.
    const upcoming = await session(b1.id, now + 3 * DAY);
    await prisma.trialClass.create({
      data: { tenantId: t, sessionId: unmarked.id, studentId: carla.id },
    });
    await prisma.trialClass.create({
      data: { tenantId: t, sessionId: upcoming.id, studentId: bea.id },
    });
    await prisma.trialClass.create({
      data: { tenantId: t, sessionId: marked.id, studentId: bea.id, status: 'CONVERTED' },
    });

    // Direct debits: one returned and still owed, one returned but paid since.
    const invoice = (number: string, status: string) =>
      prisma.invoice.create({
        data: { tenantId: t, studentId: ana.id, number, amount: 55, status } as never,
      });
    const owed = await invoice('F-2026-0001', 'PENDING');
    const settled = await invoice('F-2026-0002', 'PAID');
    const remittance = await prisma.sepaRemittance.create({
      data: {
        tenantId: t,
        messageId: 'MSG-1',
        period: '2026-10',
        collectionDate: new Date(now - 10 * DAY),
        total: 110,
        itemCount: 2,
        xml: '<Document/>',
      },
    });
    for (const inv of [owed, settled]) {
      await prisma.sepaRemittanceItem.create({
        data: {
          remittanceId: remittance.id,
          invoiceId: inv.id,
          amount: 55,
          status: 'RETURNED',
          returnReason: 'AM04',
          returnedAt: new Date(now - 5 * DAY),
        },
      });
    }

    // Another academy's unmarked class must not leak in.
    const globex = await seedTenant(prisma, {
      slug: 'globex',
      email: 'a@globex.local',
      password: 'x',
    });
    const gCourse = await prisma.course.create({ data: { tenantId: globex.tenantId, name: 'X' } });
    const gGroup = await prisma.group.create({
      data: { tenantId: globex.tenantId, courseId: gCourse.id, name: 'G' },
    });
    const gStudent = await prisma.student.create({
      data: { tenantId: globex.tenantId, firstName: 'G', lastName: 'G' },
    });
    await prisma.enrollment.create({ data: { studentId: gStudent.id, groupId: gGroup.id } });
    const foreign = await prisma.session.create({
      data: { tenantId: globex.tenantId, groupId: gGroup.id, scheduledAt: new Date(now - DAY) },
    });

    const body = await today();

    expect(body.date).toBe(madridDay);
    expect(body.classes).toEqual([
      expect.objectContaining({ id: todayClass.id, groupName: 'B1', enrolled: 1, marked: 0 }),
    ]);

    const missingIds = body.attendanceMissing.items.map((s: { id: string }) => s.id);
    expect(missingIds).toContain(unmarked.id);
    for (const id of [marked.id, cancelled.id, noStudents.id, tooOld.id, upcoming.id, foreign.id]) {
      expect(missingIds).not.toContain(id);
    }

    expect(body.trialsToFollowUp.items).toEqual([
      expect.objectContaining({ studentName: 'Carla Test', groupName: 'B1', attended: null }),
    ]);

    expect(body.spotsWithWaitlist).toEqual([
      { groupId: b1.id, groupName: 'B1', freeSpots: 1, waiting: 1, offered: 0 },
    ]);

    expect(body.returnedReceipts.total).toBe(1);
    expect(body.returnedReceipts.items[0]).toMatchObject({
      invoiceId: owed.id,
      number: 'F-2026-0001',
      studentName: 'Ana Test',
      amount: '55.00',
      returnReason: 'AM04',
    });
  });

  it('is empty for a new academy', async () => {
    const body = await today();
    expect(body).toMatchObject({
      classes: [],
      attendanceMissing: { total: 0, items: [] },
      trialsToFollowUp: { total: 0, items: [] },
      spotsWithWaitlist: [],
      returnedReceipts: { total: 0, items: [] },
    });
  });
});
