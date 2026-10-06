import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { spainNationalHolidays } from '../src/holidays/spain-national';
import { bootstrapTestApp, resetDb, seedTenant, SeededTenant } from './setup-e2e';

describe('Spanish national holidays', () => {
  it('lists the 10 national holidays of a school year, with Viernes Santo', () => {
    const y2026 = spainNationalHolidays(2026);
    expect(y2026).toHaveLength(10);
    expect(y2026[0]).toEqual({ name: 'Fiesta Nacional de España', date: '2026-10-12' });
    // Easter 2027 is 28 March → Viernes Santo 26 March.
    expect(y2026.find((h) => h.name === 'Viernes Santo')?.date).toBe('2027-03-26');
    // Easter 2026 is 5 April → Viernes Santo 3 April.
    expect(spainNationalHolidays(2025).find((h) => h.name === 'Viernes Santo')?.date).toBe(
      '2026-04-03',
    );
  });
});

describe('Holidays (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let acme: SeededTenant;
  let token: string;
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
    token = await login(acme);
    const course = await prisma.course.create({ data: { tenantId: acme.tenantId, name: 'Inglés' } });
    const group = await prisma.group.create({
      data: { tenantId: acme.tenantId, courseId: course.id, name: 'B1' },
    });
    groupId = group.id;
  });

  function http() {
    return request(app.getHttpServer());
  }
  async function login(t: SeededTenant) {
    const res = await http()
      .post('/auth/login')
      .send({ tenantSlug: t.tenantSlug, email: t.adminEmail, password: t.adminPassword })
      .expect(200);
    return res.body.accessToken as string;
  }
  const auth = () => ({ Authorization: `Bearer ${token}` });

  function session(scheduledAt: string, data: Record<string, unknown> = {}) {
    return prisma.session.create({
      data: { tenantId: acme.tenantId, groupId, scheduledAt: new Date(scheduledAt), ...data },
    });
  }
  const status = async (id: string) =>
    (await prisma.session.findUniqueOrThrow({ where: { id } })).status;

  it('creates a single day (end defaults to start) and lists it', async () => {
    const res = await http()
      .post('/holidays')
      .set(auth())
      .send({ name: 'Fiesta local', startDate: '2030-04-01' })
      .expect(201);
    expect(res.body).toMatchObject({
      name: 'Fiesta local',
      startDate: '2030-04-01',
      endDate: '2030-04-01',
      cancelledSessions: 0,
    });
    const list = await http().get('/holidays').set(auth()).expect(200);
    expect(list.body).toHaveLength(1);
  });

  it('cancels only the untouched classes inside the local dates', async () => {
    // Madrid is UTC+2 on these dates.
    const inside = await session('2030-04-01T15:00:00Z'); // 1 abr 17:00
    const lateNight = await session('2030-04-01T21:30:00Z'); // 1 abr 23:30, still inside
    const nextDay = await session('2030-04-01T22:30:00Z'); // 2 abr 00:30, outside
    const held = await session('2030-04-01T16:00:00Z', { status: 'COMPLETED' });
    const withAttendance = await session('2030-04-01T17:00:00Z');
    const student = await prisma.student.create({
      data: { tenantId: acme.tenantId, firstName: 'Ana', lastName: 'Ruiz' },
    });
    await prisma.attendance.create({ data: { sessionId: withAttendance.id, studentId: student.id } });

    const res = await http()
      .post('/holidays')
      .set(auth())
      .send({ name: 'Fiesta local', startDate: '2030-04-01' })
      .expect(201);
    expect(res.body.cancelledSessions).toBe(2);

    expect(await status(inside.id)).toBe('CANCELLED');
    expect(await status(lateNight.id)).toBe('CANCELLED');
    expect(await status(nextDay.id)).toBe('SCHEDULED');
    expect(await status(held.id)).toBe('COMPLETED');
    expect(await status(withAttendance.id)).toBe('SCHEDULED');
  });

  it("does not touch another academy's classes", async () => {
    const other = await seedTenant(prisma, {
      slug: 'other',
      email: 'admin@other.local',
      password: 'TestPassword123!',
    });
    const course = await prisma.course.create({ data: { tenantId: other.tenantId, name: 'X' } });
    const g = await prisma.group.create({
      data: { tenantId: other.tenantId, courseId: course.id, name: 'X' },
    });
    const foreign = await prisma.session.create({
      data: { tenantId: other.tenantId, groupId: g.id, scheduledAt: new Date('2030-04-01T15:00:00Z') },
    });
    await http()
      .post('/holidays')
      .set(auth())
      .send({ name: 'Fiesta local', startDate: '2030-04-01' })
      .expect(201);
    expect(await status(foreign.id)).toBe('SCHEDULED');

    const otherToken = await login(other);
    const mine = await http().get('/holidays').set(auth());
    await http()
      .delete(`/holidays/${mine.body[0].id}`)
      .set({ Authorization: `Bearer ${otherToken}` })
      .expect(404);
  });

  it('removing a holiday puts its classes back, unless another one covers them', async () => {
    const day1 = await session('2030-04-01T15:00:00Z');
    const day3 = await session('2030-04-03T15:00:00Z');

    const week = await http()
      .post('/holidays')
      .set(auth())
      .send({ name: 'Semana Santa', startDate: '2030-04-01', endDate: '2030-04-05' })
      .expect(201);
    expect(week.body.cancelledSessions).toBe(2);
    // Overlaps day 3 only; nothing left to cancel, it's already cancelled.
    const local = await http()
      .post('/holidays')
      .set(auth())
      .send({ name: 'Fiesta local', startDate: '2030-04-03' })
      .expect(201);
    expect(local.body.cancelledSessions).toBe(0);

    const del = await http().delete(`/holidays/${week.body.id}`).set(auth()).expect(200);
    expect(del.body).toEqual({ restoredSessions: 1 });

    expect(await status(day1.id)).toBe('SCHEDULED');
    const d3 = await prisma.session.findUniqueOrThrow({ where: { id: day3.id } });
    expect(d3.status).toBe('CANCELLED');
    expect(d3.cancelledByHolidayId).toBe(local.body.id);

    await http().delete(`/holidays/${local.body.id}`).set(auth()).expect(200);
    expect(await status(day3.id)).toBe('SCHEDULED');
  });

  it('session generation skips days without classes', async () => {
    await http()
      .put(`/groups/${groupId}/schedule`)
      .set(auth())
      .send({ slots: [{ weekday: 1, startTime: '17:00', durationMinutes: 60 }] })
      .expect(200);
    await http()
      .post('/holidays')
      .set(auth())
      .send({ name: 'Semana Santa', startDate: '2030-04-01', endDate: '2030-04-05' })
      .expect(201);

    const range = { from: '2030-03-25', to: '2030-04-14' }; // three Mondays
    const preview = await http()
      .post(`/groups/${groupId}/schedule/preview`)
      .set(auth())
      .send(range)
      .expect(200);
    expect(preview.body).toMatchObject({ create: 2, skippedHolidays: 1 });

    const gen = await http()
      .post(`/groups/${groupId}/schedule/generate`)
      .set(auth())
      .send(range)
      .expect(201);
    expect(gen.body).toMatchObject({ created: 2, skippedHolidays: 1 });
    const rows = await prisma.session.findMany({ where: { groupId }, orderBy: { scheduledAt: 'asc' } });
    expect(rows.map((s) => s.scheduledAt.toISOString())).toEqual([
      '2030-03-25T16:00:00.000Z',
      '2030-04-08T15:00:00.000Z',
    ]);
  });

  it('imports the national holidays once', async () => {
    const first = await http()
      .post('/holidays/national')
      .set(auth())
      .send({ schoolYear: 2030 })
      .expect(201);
    expect(first.body).toMatchObject({ created: 10, skipped: 0 });
    const again = await http()
      .post('/holidays/national')
      .set(auth())
      .send({ schoolYear: 2030 })
      .expect(201);
    expect(again.body).toMatchObject({ created: 0, skipped: 10 });
    expect((await http().get('/holidays').set(auth())).body).toHaveLength(10);
  });

  it('validates the dates', async () => {
    const post = (body: object) => http().post('/holidays').set(auth()).send(body);
    await post({ name: 'X', startDate: '2030-04-05', endDate: '2030-04-01' }).expect(400);
    await post({ name: 'X', startDate: '2030-02-30' }).expect(400);
    await post({ name: 'X', startDate: '2030-01-01', endDate: '2031-06-01' }).expect(400);
    await post({ name: '   ', startDate: '2030-04-01' }).expect(400);
    await post({ startDate: '2030-04-01' }).expect(400);
    await http().post('/holidays/national').set(auth()).send({ schoolYear: 1999 }).expect(400);
  });
});
