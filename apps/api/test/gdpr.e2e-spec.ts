import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapTestApp, resetDb, seedTenant, SeededTenant } from './setup-e2e';

describe('RGPD: export and erasure (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let acme: SeededTenant;
  let admin: string;
  let ana: string; // has an invoice, a family login shared with her brother, grades…
  let pablo: string; // Ana's brother, same family login
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
    admin = await login('admin@acme.local', 'TestPassword123!');
    const t = acme.tenantId;
    const course = await prisma.course.create({ data: { tenantId: t, name: 'Inglés' } });
    groupId = (await prisma.group.create({ data: { tenantId: t, courseId: course.id, name: 'B1' } })).id;
    const mk = (firstName: string) =>
      prisma.student.create({
        data: {
          tenantId: t,
          firstName,
          lastName: 'Ruiz',
          email: `${firstName.toLowerCase()}@example.com`,
          phone: '600000000',
          address: 'Calle Mayor 1',
          iban: 'ES7921000813610123456789',
          mandateReference: 'MND-1',
          mandateDate: new Date('2026-01-15'),
          notes: 'Alergia al polen',
        },
      });
    ana = (await mk('Ana')).id;
    pablo = (await mk('Pablo')).id;
    await prisma.enrollment.create({ data: { studentId: ana, groupId } });
    for (const sid of [ana, pablo]) {
      await http()
        .post(`/students/${sid}/portal-access`)
        .set(as(admin))
        .send({ firstName: 'Marta', lastName: 'Ruiz', email: 'marta@example.com', password: 'Familia123!' })
        .expect(201);
    }
    const s = await prisma.session.create({
      data: { tenantId: t, groupId, scheduledAt: new Date('2026-10-05T16:00:00Z') },
    });
    await prisma.attendance.create({ data: { sessionId: s.id, studentId: ana, status: 'PRESENT' } });
    const a = await prisma.assessment.create({
      data: { tenantId: t, groupId, name: 'Unit 1', date: new Date('2026-10-05') },
    });
    await prisma.assessmentResult.create({ data: { assessmentId: a.id, studentId: ana, score: 8, comment: 'Bien' } });
    await http()
      .post('/invoices')
      .set(as(admin))
      .send({ studentId: ana, amount: 55, description: 'Octubre' })
      .expect(201);
  });

  function http() {
    return request(app.getHttpServer());
  }
  async function login(email: string, password: string) {
    const res = await http().post('/auth/login').send({ tenantSlug: 'acme', email, password }).expect(200);
    return res.body.accessToken as string;
  }
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  it('a student with invoices cannot be deleted (tax law, Verifactu)', async () => {
    const res = await http().delete(`/students/${ana}`).set(as(admin)).expect(409);
    expect(res.body.message).toMatch(/Suprimir datos personales/);
    expect(await prisma.invoice.count({ where: { studentId: ana } })).toBe(1);
    // …and the database refuses it too.
    await expect(prisma.student.delete({ where: { id: ana } })).rejects.toThrow();
    // Without invoices, deleting is fine.
    await http().delete(`/students/${pablo}`).set(as(admin)).expect(204);
  });

  it('exports everything held about the student, and logs it', async () => {
    const res = await http().get(`/students/${ana}/export`).set(as(admin)).expect(200);
    expect(res.headers['content-disposition']).toContain('datos-ana-ruiz.json');
    const data = JSON.parse(res.text);
    expect(data.student).toMatchObject({ firstName: 'Ana', email: 'ana@example.com', notes: 'Alergia al polen' });
    expect(data.family).toEqual([
      expect.objectContaining({ firstName: 'Marta', email: 'marta@example.com', portalAccess: true }),
    ]);
    expect(data.enrollments[0]).toMatchObject({ group: 'B1', course: 'Inglés', status: 'ACTIVE' });
    expect(data.attendance[0]).toMatchObject({ group: 'B1', status: 'PRESENT' });
    expect(data.grades[0]).toMatchObject({ assessment: 'Unit 1', score: '8', comment: 'Bien' });
    expect(data.invoices[0]).toMatchObject({ description: 'Octubre', amount: '55' });
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'gdpr.export' } });
    expect(log).toMatchObject({ entityType: 'student', entityId: ana });
  });

  it('erasure keeps only what the invoices need', async () => {
    const res = await http().post(`/students/${ana}/erase`).set(as(admin)).expect(200);
    expect(res.body).toEqual({ deleted: false, keptInvoices: 1 });

    const s = await prisma.student.findUniqueOrThrow({ where: { id: ana } });
    expect(s).toMatchObject({
      firstName: 'Ana',
      lastName: 'Ruiz',
      address: 'Calle Mayor 1', // issued-to data of the invoice
      email: null,
      phone: null,
      iban: null,
      mandateReference: null,
      notes: null,
      isActive: false,
    });
    expect(s.erasedAt).not.toBeNull();
    expect(await prisma.invoice.count({ where: { studentId: ana } })).toBe(1);
    for (const n of await Promise.all([
      prisma.guardian.count({ where: { studentId: ana } }),
      prisma.enrollment.count({ where: { studentId: ana } }),
      prisma.attendance.count({ where: { studentId: ana } }),
      prisma.assessmentResult.count({ where: { studentId: ana } }),
    ])) {
      expect(n).toBe(0);
    }
    // The family login stays: it still has Pablo.
    expect(await prisma.user.count({ where: { email: 'marta@example.com' } })).toBe(1);

    // Gone from the student list; logged.
    const list = await http().get('/students').set(as(admin)).expect(200);
    expect(list.body.map((x: { id: string }) => x.id)).toEqual([pablo]);
    expect(await prisma.auditLog.count({ where: { action: 'gdpr.erase', entityId: ana } })).toBe(1);
  });

  it('erasure without invoices deletes the student and the orphan family login', async () => {
    const res = await http().post(`/students/${pablo}/erase`).set(as(admin)).expect(200);
    expect(res.body).toEqual({ deleted: true, keptInvoices: 0 });
    expect(await prisma.student.findUnique({ where: { id: pablo } })).toBeNull();
    // Marta still has Ana → her login stays.
    expect(await prisma.user.count({ where: { email: 'marta@example.com' } })).toBe(1);

    await http().post(`/students/${ana}/erase`).set(as(admin)).expect(200);
    // Now no child is left: the family login goes too.
    expect(await prisma.user.count({ where: { email: 'marta@example.com' } })).toBe(0);
  });

  it('only the admin, and only in their academy', async () => {
    await http()
      .post('/team')
      .set(as(admin))
      .send({ firstName: 'Sara', lastName: 'R', email: 'sara@acme.local', password: 'Secretaria123!' })
      .expect(201);
    const staff = await login('sara@acme.local', 'Secretaria123!');
    await http().get(`/students/${ana}/export`).set(as(staff)).expect(403);
    await http().post(`/students/${ana}/erase`).set(as(staff)).expect(403);

    await seedTenant(prisma, { slug: 'other', email: 'admin@other.local', password: 'TestPassword123!' });
    const res = await http()
      .post('/auth/login')
      .send({ tenantSlug: 'other', email: 'admin@other.local', password: 'TestPassword123!' })
      .expect(200);
    const other = as(res.body.accessToken);
    await http().get(`/students/${ana}/export`).set(other).expect(404);
    await http().post(`/students/${ana}/erase`).set(other).expect(404);
  });
});
