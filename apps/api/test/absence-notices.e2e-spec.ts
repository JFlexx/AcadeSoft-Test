const mockSend = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: mockSend } })),
}));

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapTestApp, resetDb, seedTenant, SeededTenant } from './setup-e2e';

const HOUR = 3_600_000;

describe('Absence notices to families (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let acme: SeededTenant;
  let admin: string;
  let teacher: string;
  let groupId: string;
  let ana: string; // has a guardian with email
  let bea: string; // no guardian, own email
  let carla: string; // no email anywhere

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
        contactEmail: 'secretaria@acme.es',
        absenceNoticesEnabled: true,
      },
    });
    admin = await login('admin@acme.local', 'TestPassword123!');

    const laura = await prisma.teacher.create({
      data: { tenantId: t, firstName: 'Laura', lastName: 'Gil' },
    });
    const course = await prisma.course.create({ data: { tenantId: t, name: 'Inglés' } });
    groupId = (
      await prisma.group.create({
        data: { tenantId: t, courseId: course.id, teacherId: laura.id, name: 'Inglés B1' },
      })
    ).id;
    const mk = (firstName: string, email: string | null) =>
      prisma.student.create({ data: { tenantId: t, firstName, lastName: 'Ruiz', email } });
    ana = (await mk('Ana', 'ana-alumna@example.com')).id;
    bea = (await mk('Bea', 'bea@example.com')).id;
    carla = (await mk('Carla', null)).id;
    await prisma.guardian.create({
      data: { studentId: ana, firstName: 'Marta', lastName: 'Ruiz', relationship: 'Madre', email: 'Marta@Example.com' },
    });
    await prisma.enrollment.createMany({
      data: [ana, bea, carla].map((studentId) => ({ studentId, groupId })),
    });

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

  function session(at: Date) {
    return prisma.session.create({
      data: { tenantId: acme.tenantId, groupId, scheduledAt: at },
    });
  }
  function teacherMarks(sessionId: string, items: { studentId: string; status: string }[]) {
    return http()
      .put(`/teacher/sessions/${sessionId}/attendance`)
      .set(as(teacher))
      .send({ items })
      .expect(200);
  }

  it('emails the family of each absent student when the teacher saves', async () => {
    const s = await session(new Date(Date.now() - HOUR));
    const res = await teacherMarks(s.id, [
      { studentId: ana, status: 'ABSENT' },
      { studentId: bea, status: 'ABSENT' },
      { studentId: carla, status: 'ABSENT' }, // no email: skipped
    ]);
    expect(res.body.noticesSent).toBe(2);
    expect(mockSend).toHaveBeenCalledTimes(2);

    const recipients = mockSend.mock.calls.map((c) => c[0].to);
    // Guardian first (not the student's own address); the student if no guardian.
    expect(recipients).toEqual(expect.arrayContaining([['marta@example.com'], ['bea@example.com']]));
    const toAna = mockSend.mock.calls.find((c) => c[0].to[0] === 'marta@example.com')![0];
    expect(toAna.subject).toBe('Falta de asistencia: Ana Ruiz (Inglés B1)');
    expect(toAna.from).toContain('Academia Acme');
    expect(toAna.replyTo).toBe('secretaria@acme.es');
    expect(toAna.html).toContain('no ha asistido');

    const marked = await prisma.attendance.findFirstOrThrow({ where: { studentId: ana } });
    expect(marked.absenceNotifiedAt).not.toBeNull();
  });

  it('notifies each absence once, and never for present or late students', async () => {
    const s = await session(new Date(Date.now() - HOUR));
    await teacherMarks(s.id, [
      { studentId: ana, status: 'ABSENT' },
      { studentId: bea, status: 'LATE' },
    ]);
    expect(mockSend).toHaveBeenCalledTimes(1);

    // Saving again (e.g. after marking someone else) doesn't re-send.
    const again = await teacherMarks(s.id, [
      { studentId: ana, status: 'ABSENT' },
      { studentId: bea, status: 'PRESENT' },
    ]);
    expect(again.body.noticesSent).toBe(0);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('also works when the admin takes attendance', async () => {
    const s = await session(new Date(Date.now() - HOUR));
    await http()
      .post(`/sessions/${s.id}/attendance`)
      .set(as(admin))
      .send({ items: [{ studentId: ana, status: 'ABSENT' }] })
      .expect(201);
    expect(mockSend).toHaveBeenCalledTimes(1);

    // Correcting a present student to absent through the single-row endpoint.
    await http()
      .post(`/sessions/${s.id}/attendance`)
      .set(as(admin))
      .send({ items: [{ studentId: bea, status: 'PRESENT' }] })
      .expect(201);
    await http()
      .patch(`/sessions/${s.id}/attendance/${bea}`)
      .set(as(admin))
      .send({ status: 'ABSENT' })
      .expect(200);
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('does nothing when the academy has not opted in', async () => {
    await prisma.tenant.update({
      where: { id: acme.tenantId },
      data: { absenceNoticesEnabled: false },
    });
    const s = await session(new Date(Date.now() - HOUR));
    const res = await teacherMarks(s.id, [{ studentId: ana, status: 'ABSENT' }]);
    expect(res.body.noticesSent).toBe(0);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('does not email for old classes (back-filling) or far-future ones', async () => {
    const old = await session(new Date(Date.now() - 3 * 24 * HOUR));
    const future = await session(new Date(Date.now() + 5 * HOUR));
    await teacherMarks(old.id, [{ studentId: ana, status: 'ABSENT' }]);
    await teacherMarks(future.id, [{ studentId: ana, status: 'ABSENT' }]);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('a failed email does not break attendance and is retried on the next save', async () => {
    mockSend.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    const s = await session(new Date(Date.now() - HOUR));
    const first = await teacherMarks(s.id, [{ studentId: ana, status: 'ABSENT' }]);
    expect(first.body.noticesSent).toBe(0);
    expect(first.body.students.find((x: { id: string }) => x.id === ana).attendance.status).toBe(
      'ABSENT',
    );

    const second = await teacherMarks(s.id, [{ studentId: ana, status: 'ABSENT' }]);
    expect(second.body.noticesSent).toBe(1);
  });

  it('the setting can be toggled from Ajustes', async () => {
    const res = await http()
      .patch('/settings')
      .set(as(admin))
      .send({ absenceNoticesEnabled: false })
      .expect(200);
    expect(res.body.absenceNoticesEnabled).toBe(false);
  });
});
