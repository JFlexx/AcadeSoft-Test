import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { isoWeekday, zonedToUtc } from '../src/class-schedule/zoned-time';
import { bootstrapTestApp, resetDb, seedTenant, SeededTenant } from './setup-e2e';

describe('zoned time helpers', () => {
  it('keeps the local class time across daylight-saving changes (Madrid)', () => {
    // Winter (UTC+1) and summer (UTC+2) around the 2030-03-31 switch.
    expect(zonedToUtc('2030-03-25', '17:00', 'Europe/Madrid').toISOString()).toBe(
      '2030-03-25T16:00:00.000Z',
    );
    expect(zonedToUtc('2030-04-01', '17:00', 'Europe/Madrid').toISOString()).toBe(
      '2030-04-01T15:00:00.000Z',
    );
    // The October switch day itself (2026-10-25) is already winter time.
    expect(zonedToUtc('2026-10-24', '17:00', 'Europe/Madrid').toISOString()).toBe(
      '2026-10-24T15:00:00.000Z',
    );
    expect(zonedToUtc('2026-10-25', '17:00', 'Europe/Madrid').toISOString()).toBe(
      '2026-10-25T16:00:00.000Z',
    );
  });

  it('supports Canarias (one hour behind the peninsula)', () => {
    expect(zonedToUtc('2030-04-01', '17:00', 'Atlantic/Canary').toISOString()).toBe(
      '2030-04-01T16:00:00.000Z',
    );
  });

  it('computes ISO weekdays', () => {
    expect(isoWeekday('2030-03-25')).toBe(1); // lunes
    expect(isoWeekday('2030-03-31')).toBe(7); // domingo
  });
});

describe('Class schedule (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let acme: SeededTenant;
  let token: string;
  let groupId: string;
  let teacherId: string;

  // Two weeks that cross the 2030-03-31 DST switch. Far future on purpose:
  // "replace" only touches classes that are still ahead of now.
  const RANGE = { from: '2030-03-25', to: '2030-04-07' };
  const SLOTS = [
    { weekday: 1, startTime: '17:00', durationMinutes: 60 }, // lunes
    { weekday: 3, startTime: '18:30', durationMinutes: 90 }, // miércoles
  ];

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
      .send({ tenantSlug: 'acme', email: acme.adminEmail, password: acme.adminPassword })
      .expect(200);
    token = res.body.accessToken;

    const course = await prisma.course.create({ data: { tenantId: acme.tenantId, name: 'Inglés' } });
    const teacher = await prisma.teacher.create({
      data: { tenantId: acme.tenantId, firstName: 'Laura', lastName: 'Gil' },
    });
    teacherId = teacher.id;
    const group = await prisma.group.create({
      data: { tenantId: acme.tenantId, courseId: course.id, teacherId, name: 'B1' },
    });
    groupId = group.id;
  });

  function http() {
    return request(app.getHttpServer());
  }
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const url = (suffix = '') => `/groups/${groupId}/schedule${suffix}`;

  async function sessions() {
    return prisma.session.findMany({ where: { groupId }, orderBy: { scheduledAt: 'asc' } });
  }

  it('replaces the weekly schedule and returns it ordered', async () => {
    await http().put(url()).set(auth()).send({ slots: [SLOTS[1], SLOTS[0]] }).expect(200);
    const res = await http().get(url()).set(auth()).expect(200);
    expect(res.body.timezone).toBe('Europe/Madrid');
    expect(res.body.slots.map((s: { weekday: number }) => s.weekday)).toEqual([1, 3]);

    await http().put(url()).set(auth()).send({ slots: [] }).expect(200);
    expect((await http().get(url()).set(auth())).body.slots).toEqual([]);
  });

  it('rejects invalid or duplicated slots', async () => {
    await http()
      .put(url())
      .set(auth())
      .send({ slots: [{ weekday: 8, startTime: '17:00', durationMinutes: 60 }] })
      .expect(400);
    await http()
      .put(url())
      .set(auth())
      .send({ slots: [{ weekday: 1, startTime: '25:00', durationMinutes: 60 }] })
      .expect(400);
    await http().put(url()).set(auth()).send({ slots: [SLOTS[0], SLOTS[0]] }).expect(400);
  });

  it('previews without writing, then generates sessions in local time', async () => {
    await http().put(url()).set(auth()).send({ slots: SLOTS }).expect(200);

    const preview = await http().post(url('/preview')).set(auth()).send(RANGE).expect(200);
    expect(preview.body).toMatchObject({ create: 4, replace: 0, alreadyScheduled: 0 });
    expect(await sessions()).toHaveLength(0);

    const gen = await http().post(url('/generate')).set(auth()).send(RANGE).expect(201);
    expect(gen.body).toMatchObject({ created: 4, replaced: 0, alreadyScheduled: 0 });

    const rows = await sessions();
    expect(rows.map((s) => s.scheduledAt.toISOString())).toEqual([
      '2030-03-25T16:00:00.000Z', // lunes 17:00, invierno
      '2030-03-27T17:30:00.000Z', // miércoles 18:30, invierno
      '2030-04-01T15:00:00.000Z', // lunes 17:00, verano
      '2030-04-03T16:30:00.000Z', // miércoles 18:30, verano
    ]);
    expect(rows.map((s) => s.durationMinutes)).toEqual([60, 90, 60, 90]);
    expect(rows.every((s) => s.teacherId === teacherId && s.status === 'SCHEDULED')).toBe(true);
  });

  it('is idempotent: re-running does not duplicate classes', async () => {
    await http().put(url()).set(auth()).send({ slots: SLOTS }).expect(200);
    await http().post(url('/generate')).set(auth()).send(RANGE).expect(201);
    const again = await http().post(url('/generate')).set(auth()).send(RANGE).expect(201);
    expect(again.body).toMatchObject({ created: 0, alreadyScheduled: 4 });
    expect(await sessions()).toHaveLength(4);
  });

  it('replace: moves untouched classes to the new schedule, keeps history', async () => {
    await http().put(url()).set(auth()).send({ slots: SLOTS }).expect(200);
    await http().post(url('/generate')).set(auth()).send(RANGE).expect(201);

    // The first Monday already has attendance: it must survive.
    const [firstMonday] = await sessions();
    const student = await prisma.student.create({
      data: { tenantId: acme.tenantId, firstName: 'Ana', lastName: 'Ruiz' },
    });
    await prisma.attendance.create({
      data: { sessionId: firstMonday.id, studentId: student.id, status: 'PRESENT' },
    });

    // Monday class moves to Tuesday; Wednesday stays the same.
    await http()
      .put(url())
      .set(auth())
      .send({ slots: [{ weekday: 2, startTime: '17:00', durationMinutes: 60 }, SLOTS[1]] })
      .expect(200);

    const gen = await http()
      .post(url('/generate'))
      .set(auth())
      .send({ ...RANGE, replace: true })
      .expect(201);
    // 1 Monday replaced (the other has attendance), 2 Tuesdays created,
    // 2 Wednesdays already match and are left alone.
    expect(gen.body).toMatchObject({ created: 2, replaced: 1, alreadyScheduled: 2 });

    const rows = await sessions();
    expect(rows.map((s) => s.scheduledAt.toISOString())).toEqual([
      '2030-03-25T16:00:00.000Z', // lunes con asistencia, se conserva
      '2030-03-26T16:00:00.000Z', // martes nuevo
      '2030-03-27T17:30:00.000Z',
      '2030-04-02T15:00:00.000Z', // martes nuevo
      '2030-04-03T16:30:00.000Z',
    ]);
    expect(rows.find((s) => s.id === firstMonday.id)).toBeDefined();
  });

  it('without replace, existing classes are never deleted', async () => {
    await http().put(url()).set(auth()).send({ slots: SLOTS }).expect(200);
    await http().post(url('/generate')).set(auth()).send(RANGE).expect(201);
    await http()
      .put(url())
      .set(auth())
      .send({ slots: [{ weekday: 2, startTime: '17:00', durationMinutes: 60 }] })
      .expect(200);
    const gen = await http().post(url('/generate')).set(auth()).send(RANGE).expect(201);
    expect(gen.body).toMatchObject({ created: 2, replaced: 0 });
    expect(await sessions()).toHaveLength(6);
  });

  it('defaults the range to the group dates', async () => {
    await prisma.group.update({
      where: { id: groupId },
      data: { startDate: new Date('2030-03-25'), endDate: new Date('2030-03-31') },
    });
    await http().put(url()).set(auth()).send({ slots: SLOTS }).expect(200);
    const preview = await http().post(url('/preview')).set(auth()).send({}).expect(200);
    expect(preview.body).toMatchObject({ from: '2030-03-25', to: '2030-03-31', create: 2 });
  });

  it('validates the request', async () => {
    // No schedule yet
    await http().post(url('/preview')).set(auth()).send(RANGE).expect(400);

    await http().put(url()).set(auth()).send({ slots: SLOTS }).expect(200);
    // No end date on the group and none given
    const noEnd = await http().post(url('/preview')).set(auth()).send({}).expect(400);
    expect(noEnd.body.message).toMatch(/fecha de fin/);
    await http()
      .post(url('/preview'))
      .set(auth())
      .send({ from: '2030-04-07', to: '2030-03-25' })
      .expect(400);
    await http()
      .post(url('/preview'))
      .set(auth())
      .send({ from: '2030-02-30', to: '2030-03-25' })
      .expect(400);
    await http()
      .post(url('/preview'))
      .set(auth())
      .send({ from: '2030-01-01', to: '2031-06-30' })
      .expect(400);
  });

  it("can't touch another academy's group", async () => {
    const other = await seedTenant(prisma, {
      slug: 'other',
      email: 'admin@other.local',
      password: 'TestPassword123!',
    });
    const res = await http()
      .post('/auth/login')
      .send({ tenantSlug: 'other', email: other.adminEmail, password: other.adminPassword })
      .expect(200);
    const otherAuth = { Authorization: `Bearer ${res.body.accessToken}` };
    await http().get(url()).set(otherAuth).expect(404);
    await http().put(url()).set(otherAuth).send({ slots: SLOTS }).expect(404);
    await http().post(url('/generate')).set(otherAuth).send(RANGE).expect(404);
  });
});
