const mockSend = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: mockSend } })),
}));

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReportCardsService } from '../src/assessments/report-cards.service';
import { bootstrapTestApp, resetDb, seedTenant, SeededTenant } from './setup-e2e';

describe('Report cards (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let service: ReportCardsService;
  let acme: SeededTenant;
  let admin: string;
  let groupId: string;
  let ana: string; // guardian with email
  let bea: string; // no email

  const TERM = { from: '2026-09-15', to: '2026-12-22', title: '1º trimestre 2026-27' };

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapTestApp());
    service = app.get(ReportCardsService);
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
      data: { name: 'Academia Acme', contactEmail: 'secretaria@acme.es' },
    });
    const res = await http()
      .post('/auth/login')
      .send({ tenantSlug: 'acme', email: 'admin@acme.local', password: 'TestPassword123!' })
      .expect(200);
    admin = res.body.accessToken;

    const laura = await prisma.teacher.create({ data: { tenantId: t, firstName: 'Laura', lastName: 'Gil' } });
    const course = await prisma.course.create({ data: { tenantId: t, name: 'Inglés' } });
    groupId = (
      await prisma.group.create({ data: { tenantId: t, courseId: course.id, teacherId: laura.id, name: 'B1' } })
    ).id;
    ana = (await prisma.student.create({ data: { tenantId: t, firstName: 'Ána', lastName: 'Ruiz' } })).id;
    bea = (await prisma.student.create({ data: { tenantId: t, firstName: 'Bea', lastName: 'Sol' } })).id;
    await prisma.guardian.create({
      data: { studentId: ana, firstName: 'Marta', lastName: 'Ruiz', relationship: 'Madre', email: 'marta@example.com' },
    });
    await prisma.enrollment.createMany({ data: [ana, bea].map((studentId) => ({ studentId, groupId })) });

    const assessment = (name: string, date: string) =>
      prisma.assessment.create({ data: { tenantId: t, groupId, name, date: new Date(date) } });
    const unit1 = await assessment('Examen Unit 1', '2026-10-05');
    const unit2 = await assessment('Examen Unit 2', '2026-11-20');
    const later = await assessment('Examen Unit 5', '2027-02-10'); // outside the term
    await prisma.assessmentResult.createMany({
      data: [
        { assessmentId: unit1.id, studentId: ana, score: 8.5, comment: 'Muy bien' },
        { assessmentId: unit2.id, studentId: ana, score: 7 },
        { assessmentId: later.id, studentId: ana, score: 2 },
      ],
    });
    // Attendance in the term: present, late, absent → 2 of 3.
    let i = 0;
    for (const status of ['PRESENT', 'LATE', 'ABSENT'] as const) {
      const s = await prisma.session.create({
        data: { tenantId: t, groupId, scheduledAt: new Date(`2026-10-${10 + i++}T16:00:00Z`) },
      });
      await prisma.attendance.create({ data: { sessionId: s.id, studentId: ana, status } });
    }
  });

  function http() {
    return request(app.getHttpServer());
  }
  const auth = () => ({ Authorization: `Bearer ${admin}` });

  it('gathers the term grades, average and attendance', async () => {
    const d = await service.data(acme.tenantId, ana, TERM);
    expect(d.title).toBe('1º trimestre 2026-27');
    expect(d.groups).toHaveLength(1);
    expect(d.groups[0]).toMatchObject({
      name: 'B1',
      course: 'Inglés',
      teacher: 'Laura Gil',
      average: '7.75',
      attendance: { attended: 2, marked: 3, pct: 67 },
    });
    expect(d.groups[0].assessments).toEqual([
      { date: '2026-10-05', name: 'Examen Unit 1', score: '8.5', comment: 'Muy bien' },
      { date: '2026-11-20', name: 'Examen Unit 2', score: '7', comment: null },
    ]);
  });

  it('downloads the PDF', async () => {
    const res = await http()
      .get(`/students/${ana}/report-card`)
      .query(TERM)
      .set(auth())
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('boletin-ana-ruiz-2026-09-15.pdf');
    expect((res.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });

  it('previews who will receive the group report cards', async () => {
    const res = await http().get(`/groups/${groupId}/report-cards/preview`).set(auth()).expect(200);
    expect(res.body.students).toEqual([
      { id: ana, name: 'Ána Ruiz', hasEmail: true },
      { id: bea, name: 'Bea Sol', hasEmail: false },
    ]);
    expect(res.body.emailConfigured).toBe(true);
  });

  it('emails each family their child’s report card as a PDF', async () => {
    const res = await http()
      .post(`/groups/${groupId}/report-cards/send`)
      .set(auth())
      .send(TERM)
      .expect(200);
    expect(res.body).toEqual({ sent: 1, withoutEmail: 1, failed: 0 });

    const mail = mockSend.mock.calls[0][0];
    expect(mail.to).toEqual(['marta@example.com']);
    expect(mail.subject).toBe('1º trimestre 2026-27 — Ána Ruiz');
    expect(mail.replyTo).toBe('secretaria@acme.es');
    expect(mail.attachments).toHaveLength(1);
    expect(mail.attachments[0].filename).toBe('boletin-ana-ruiz-2026-09-15.pdf');
    expect(Buffer.from(mail.attachments[0].content).subarray(0, 4).toString()).toBe('%PDF');
  });

  it('counts failures without stopping', async () => {
    mockSend.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    const res = await http().post(`/groups/${groupId}/report-cards/send`).set(auth()).send(TERM).expect(200);
    expect(res.body).toEqual({ sent: 0, withoutEmail: 1, failed: 1 });
  });

  it('validates the term and is private to each academy', async () => {
    await http()
      .get(`/students/${ana}/report-card`)
      .query({ from: '2026-12-22', to: '2026-09-15' })
      .set(auth())
      .expect(400);
    await http().post(`/groups/${groupId}/report-cards/send`).set(auth()).send({ from: '2026-02-30', to: '2026-03-01' }).expect(400);

    await seedTenant(prisma, { slug: 'other', email: 'admin@other.local', password: 'TestPassword123!' });
    const res = await http()
      .post('/auth/login')
      .send({ tenantSlug: 'other', email: 'admin@other.local', password: 'TestPassword123!' })
      .expect(200);
    const other = { Authorization: `Bearer ${res.body.accessToken}` };
    await http().get(`/students/${ana}/report-card`).query(TERM).set(other).expect(404);
    await http().post(`/groups/${groupId}/report-cards/send`).set(other).send(TERM).expect(404);
  });
});
