const mockSend = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: mockSend } })),
}));

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapTestApp, resetDb, seedTenant, SeededTenant } from './setup-e2e';

const HOUR = 3_600_000;

describe('Trial classes (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let acme: SeededTenant;
  let admin: string;
  let teacher: string;
  let groupId: string;
  let s: Record<string, string>;

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
    const t = acme.tenantId;
    await prisma.tenant.update({
      where: { id: t },
      data: {
        name: 'Academia Acme',
        address: 'Calle Mayor 1, Madrid',
        contactEmail: 'secretaria@acme.es',
        trialClassesEnabled: true,
      },
    });
    admin = await login('admin@acme.local', 'TestPassword123!');

    const laura = await prisma.teacher.create({ data: { tenantId: t, firstName: 'Laura', lastName: 'Gil' } });
    const course = await prisma.course.create({ data: { tenantId: t, name: 'Inglés' } });
    groupId = (
      await prisma.group.create({
        data: { tenantId: t, courseId: course.id, teacherId: laura.id, name: 'B1', maxCapacity: 3 },
      })
    ).id;
    const session = (inHours: number, data: Record<string, unknown> = {}) =>
      prisma.session.create({
        data: { tenantId: t, groupId, scheduledAt: new Date(Date.now() + inHours * HOUR), ...data },
      });
    s = {
      tooSoon: (await session(1)).id,
      tomorrow: (await session(24)).id,
      later: (await session(48)).id,
      cancelled: (await session(72, { status: 'CANCELLED' })).id,
      far: (await session(24 * 40)).id,
    };

    await http()
      .post(`/teachers/${laura.id}/access`)
      .set(as(admin))
      .send({ email: 'laura@acme.local', password: 'ProfePass123!' })
      .expect(201);
    teacher = await login('laura@acme.local', 'ProfePass123!');
  });

  function http() {
    return request(app.getHttpServer());
  }
  async function login(email: string, password: string) {
    const res = await http().post('/auth/login').send({ tenantSlug: 'acme', email, password }).expect(200);
    return res.body.accessToken as string;
  }
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const book = (sessionId: string, name = 'Ana') =>
    http()
      .post('/public/academy/acme/trial')
      .send({ acceptPrivacy: true,
        sessionId,
        firstName: name,
        lastName: 'García',
        guardianName: 'María García',
        guardianEmail: `${name.toLowerCase()}-familia@example.com`,
        notes: 'Nivel intermedio',
      });

  it('is off unless the academy enables it', async () => {
    await prisma.tenant.update({ where: { id: acme.tenantId }, data: { trialClassesEnabled: false } });
    const groups = await http().get('/public/academy/acme/groups').expect(200);
    expect(groups.body.trialClasses).toBe(false);
    await http().get(`/public/academy/acme/groups/${groupId}/trial-sessions`).expect(404);
    await book(s.tomorrow).expect(400);
  });

  it('offers only the next bookable classes', async () => {
    const groups = await http().get('/public/academy/acme/groups').expect(200);
    expect(groups.body.trialClasses).toBe(true);
    const res = await http().get(`/public/academy/acme/groups/${groupId}/trial-sessions`).expect(200);
    expect(res.body.full).toBe(false);
    expect(res.body.sessions.map((x: { id: string }) => x.id)).toEqual([s.tomorrow, s.later]);
  });

  it('books a trial and emails the family a confirmation', async () => {
    const res = await book(s.tomorrow).expect(201);
    expect(res.body).toMatchObject({ ok: true, groupName: 'B1' });

    const trial = await prisma.trialClass.findFirstOrThrow({ include: { student: { include: { guardians: true } } } });
    expect(trial).toMatchObject({ sessionId: s.tomorrow, status: 'BOOKED' });
    expect(trial.student).toMatchObject({ firstName: 'Ana', notes: 'Nivel intermedio' });
    expect(trial.student.guardians[0].email).toBe('ana-familia@example.com');

    expect(mockSend).toHaveBeenCalledTimes(1);
    const mail = mockSend.mock.calls[0][0];
    expect(mail.to).toEqual(['ana-familia@example.com']);
    expect(mail.subject).toBe('Clase de prueba confirmada: B1');
    expect(mail.replyTo).toBe('secretaria@acme.es');
    expect(mail.html).toContain('Calle Mayor 1, Madrid');
  });

  it('a failed email does not undo the booking', async () => {
    mockSend.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    await book(s.tomorrow).expect(201);
    expect(await prisma.trialClass.count()).toBe(1);
  });

  it('rejects classes that are too soon, too far, cancelled or unknown', async () => {
    for (const id of [s.tooSoon, s.far, s.cancelled, 'nope']) {
      await book(id).expect(400);
    }
    expect(await prisma.trialClass.count()).toBe(0);
  });

  it('caps trials per class and hides full classes', async () => {
    await book(s.tomorrow, 'Ana').expect(201);
    await book(s.tomorrow, 'Bea').expect(201);
    await book(s.tomorrow, 'Carla').expect(201);
    const res = await book(s.tomorrow, 'Dani').expect(400);
    expect(res.body.message).toMatch(/otro día/);

    const open = await http().get(`/public/academy/acme/groups/${groupId}/trial-sessions`).expect(200);
    expect(open.body.sessions.map((x: { id: string }) => x.id)).toEqual([s.later]);
  });

  it('no trials in a full group', async () => {
    const t = acme.tenantId;
    for (const name of ['A', 'B', 'C']) {
      const st = await prisma.student.create({ data: { tenantId: t, firstName: name, lastName: 'X' } });
      await prisma.enrollment.create({ data: { studentId: st.id, groupId } });
    }
    const res = await http().get(`/public/academy/acme/groups/${groupId}/trial-sessions`).expect(200);
    expect(res.body).toEqual({ full: true, sessions: [] });
    await book(s.tomorrow).expect(400);
  });

  it('the teacher sees the trial student and can take their attendance', async () => {
    await book(s.tomorrow).expect(201);
    const list = await http()
      .get('/teacher/sessions')
      .query({ from: new Date().toISOString(), to: new Date(Date.now() + 5 * 24 * HOUR).toISOString() })
      .set(as(teacher))
      .expect(200);
    expect(list.body.find((x: { id: string }) => x.id === s.tomorrow).trials).toBe(1);

    const detail = await http().get(`/teacher/sessions/${s.tomorrow}`).set(as(teacher)).expect(200);
    expect(detail.body.students).toEqual([
      expect.objectContaining({ firstName: 'Ana', trial: true, attendance: null }),
    ]);
    const ana = detail.body.students[0].id;
    await http()
      .put(`/teacher/sessions/${s.tomorrow}/attendance`)
      .set(as(teacher))
      .send({ items: [{ studentId: ana, status: 'PRESENT' }] })
      .expect(200);

    const trials = await http().get('/trials').set(as(admin)).expect(200);
    expect(trials.body[0]).toMatchObject({
      status: 'BOOKED',
      attendance: 'PRESENT',
      student: { firstName: 'Ana' },
      session: { group: { name: 'B1' } },
    });
  });

  it('converts a trial into an enrollment, once', async () => {
    await book(s.tomorrow).expect(201);
    const [trial] = (await http().get('/trials').set(as(admin))).body;

    const res = await http().post(`/trials/${trial.id}/convert`).set(as(admin)).send({}).expect(200);
    expect(res.body.enrollment).toMatchObject({ groupId, status: 'ACTIVE' });
    expect((await prisma.trialClass.findUniqueOrThrow({ where: { id: trial.id } })).status).toBe(
      'CONVERTED',
    );

    await http().post(`/trials/${trial.id}/convert`).set(as(admin)).send({}).expect(409);
    await http().post(`/trials/${trial.id}/cancel`).set(as(admin)).expect(400);
  });

  it('can convert straight into the waiting list', async () => {
    await book(s.tomorrow).expect(201);
    const [trial] = (await http().get('/trials').set(as(admin))).body;
    const res = await http()
      .post(`/trials/${trial.id}/convert`)
      .set(as(admin))
      .send({ status: 'WAITLIST' })
      .expect(200);
    expect(res.body.enrollment.status).toBe('WAITLIST');
  });

  it('a cancelled trial frees the slot and leaves the roster', async () => {
    await book(s.tomorrow).expect(201);
    const [trial] = (await http().get('/trials').set(as(admin))).body;
    await http().post(`/trials/${trial.id}/cancel`).set(as(admin)).expect(200);

    const detail = await http().get(`/teacher/sessions/${s.tomorrow}`).set(as(teacher)).expect(200);
    expect(detail.body.students).toEqual([]);
    await http().post(`/trials/${trial.id}/convert`).set(as(admin)).send({}).expect(400);
  });

  it('the setting is part of Ajustes; trials are per academy', async () => {
    const res = await http().patch('/settings').set(as(admin)).send({ trialClassesEnabled: false }).expect(200);
    expect(res.body.trialClassesEnabled).toBe(false);

    await prisma.tenant.update({ where: { id: acme.tenantId }, data: { trialClassesEnabled: true } });
    await book(s.tomorrow).expect(201);
    const [trial] = (await http().get('/trials').set(as(admin))).body;
    await seedTenant(prisma, { slug: 'other', email: 'admin@other.local', password: 'TestPassword123!' });
    const other = await http()
      .post('/auth/login')
      .send({ tenantSlug: 'other', email: 'admin@other.local', password: 'TestPassword123!' })
      .expect(200);
    const otherAuth = as(other.body.accessToken);
    expect((await http().get('/trials').set(otherAuth).expect(200)).body).toEqual([]);
    await http().post(`/trials/${trial.id}/convert`).set(otherAuth).send({}).expect(404);
  });
});
