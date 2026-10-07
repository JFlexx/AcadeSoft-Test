import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapTestApp, resetDb, seedTenant, SeededTenant } from './setup-e2e';

describe('Assessments / grades (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let acme: SeededTenant;
  let admin: string;
  let teacher: string;
  let lauraGroup: string;
  let otherGroup: string;
  let ana: string;
  let bea: string;
  let dani: string; // dropped

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
    admin = await login('admin@acme.local', 'TestPassword123!');
    const laura = await prisma.teacher.create({ data: { tenantId: t, firstName: 'Laura', lastName: 'Gil' } });
    const carlos = await prisma.teacher.create({ data: { tenantId: t, firstName: 'Carlos', lastName: 'R' } });
    const course = await prisma.course.create({ data: { tenantId: t, name: 'Inglés' } });
    lauraGroup = (
      await prisma.group.create({ data: { tenantId: t, courseId: course.id, teacherId: laura.id, name: 'B1' } })
    ).id;
    otherGroup = (
      await prisma.group.create({ data: { tenantId: t, courseId: course.id, teacherId: carlos.id, name: 'A2' } })
    ).id;
    const mk = (firstName: string) =>
      prisma.student.create({ data: { tenantId: t, firstName, lastName: 'Ruiz' } });
    ana = (await mk('Ana')).id;
    bea = (await mk('Bea')).id;
    dani = (await mk('Dani')).id;
    await prisma.enrollment.createMany({
      data: [
        { studentId: ana, groupId: lauraGroup },
        { studentId: bea, groupId: lauraGroup },
        { studentId: dani, groupId: lauraGroup, status: 'DROPPED' },
      ],
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

  it('admin creates an assessment and sees the roster (active students only)', async () => {
    const res = await http()
      .post(`/groups/${lauraGroup}/assessments`)
      .set(as(admin))
      .send({ name: '1ª evaluación', date: '2026-12-18' })
      .expect(201);
    expect(res.body).toMatchObject({ name: '1ª evaluación', date: '2026-12-18', group: { name: 'B1' } });
    expect(res.body.students.map((s: { firstName: string }) => s.firstName)).toEqual(['Ana', 'Bea']);
    expect(res.body.students[0].result).toBeNull();
  });

  it('saves grades, computes the average, clears a grade', async () => {
    const { body: a } = await http()
      .post(`/groups/${lauraGroup}/assessments`)
      .set(as(admin))
      .send({ name: 'Examen Unit 3', date: '2026-11-20' })
      .expect(201);
    const saved = await http()
      .put(`/assessments/${a.id}/results`)
      .set(as(admin))
      .send({
        items: [
          { studentId: ana, score: 8.5, comment: 'Muy bien en speaking' },
          { studentId: bea, score: 6 },
        ],
      })
      .expect(200);
    expect(saved.body.students[0].result).toEqual({ score: '8.5', comment: 'Muy bien en speaking' });

    const list = await http().get(`/groups/${lauraGroup}/assessments`).set(as(admin)).expect(200);
    expect(list.body[0]).toMatchObject({ name: 'Examen Unit 3', graded: 2, average: '7.25' });

    await http()
      .put(`/assessments/${a.id}/results`)
      .set(as(admin))
      .send({ items: [{ studentId: bea, score: null, comment: '' }] })
      .expect(200);
    const after = await http().get(`/groups/${lauraGroup}/assessments`).set(as(admin));
    expect(after.body[0]).toMatchObject({ graded: 1, average: '8.50' });
  });

  it('validates grades, dates and the roster', async () => {
    const { body: a } = await http()
      .post(`/groups/${lauraGroup}/assessments`)
      .set(as(admin))
      .send({ name: 'Parcial', date: '2026-11-20' })
      .expect(201);
    const put = (items: object[]) => http().put(`/assessments/${a.id}/results`).set(as(admin)).send({ items });
    await put([{ studentId: ana, score: 11 }]).expect(400);
    await put([{ studentId: ana, score: -1 }]).expect(400);
    await put([{ studentId: dani, score: 5 }]).expect(400); // dropped: not in the roster
    await put([
      { studentId: ana, score: 5 },
      { studentId: ana, score: 6 },
    ]).expect(400);
    await http()
      .post(`/groups/${lauraGroup}/assessments`)
      .set(as(admin))
      .send({ name: 'X', date: '2026-02-30' })
      .expect(400);
  });

  it('renames, moves and deletes an assessment', async () => {
    const { body: a } = await http()
      .post(`/groups/${lauraGroup}/assessments`)
      .set(as(admin))
      .send({ name: 'Parcial', date: '2026-11-20' })
      .expect(201);
    const upd = await http()
      .patch(`/assessments/${a.id}`)
      .set(as(admin))
      .send({ name: 'Parcial Unit 2', date: '2026-11-27' })
      .expect(200);
    expect(upd.body).toMatchObject({ name: 'Parcial Unit 2', date: '2026-11-27' });
    await http().delete(`/assessments/${a.id}`).set(as(admin)).expect(204);
    expect((await http().get(`/groups/${lauraGroup}/assessments`).set(as(admin))).body).toEqual([]);
  });

  it('the teacher grades only the groups they teach', async () => {
    const groups = await http().get('/teacher/groups').set(as(teacher)).expect(200);
    expect(groups.body).toEqual([expect.objectContaining({ id: lauraGroup, name: 'B1', students: 2 })]);

    const { body: a } = await http()
      .post(`/teacher/groups/${lauraGroup}/assessments`)
      .set(as(teacher))
      .send({ name: 'Dictado', date: '2026-11-10' })
      .expect(201);
    await http()
      .put(`/teacher/assessments/${a.id}/results`)
      .set(as(teacher))
      .send({ items: [{ studentId: ana, score: 9 }] })
      .expect(200);

    // Not their group / not their assessment.
    await http().get(`/teacher/groups/${otherGroup}/assessments`).set(as(teacher)).expect(404);
    const { body: other } = await http()
      .post(`/groups/${otherGroup}/assessments`)
      .set(as(admin))
      .send({ name: 'A2 parcial', date: '2026-11-10' })
      .expect(201);
    await http().get(`/teacher/assessments/${other.id}`).set(as(teacher)).expect(404);
    await http()
      .put(`/teacher/assessments/${other.id}/results`)
      .set(as(teacher))
      .send({ items: [{ studentId: ana, score: 1 }] })
      .expect(404);

    // And no admin endpoints.
    await http().get(`/groups/${lauraGroup}/assessments`).set(as(teacher)).expect(403);
  });

  it('families see their child’s grades in the portal', async () => {
    const { body: a } = await http()
      .post(`/groups/${lauraGroup}/assessments`)
      .set(as(admin))
      .send({ name: '1ª evaluación', date: '2026-12-18' })
      .expect(201);
    await http()
      .put(`/assessments/${a.id}/results`)
      .set(as(admin))
      .send({ items: [{ studentId: ana, score: 7.5, comment: 'Progresa adecuadamente' }] })
      .expect(200);
    await http()
      .post(`/students/${ana}/portal-access`)
      .set(as(admin))
      .send({ firstName: 'Marta', lastName: 'Ruiz', email: 'marta@example.com', password: 'Familia123!' })
      .expect(201);
    const family = await login('marta@example.com', 'Familia123!');
    const portal = await http().get('/portal/students').set(as(family)).expect(200);
    expect(portal.body[0].assessmentResults).toEqual([
      {
        score: '7.5',
        comment: 'Progresa adecuadamente',
        assessment: { name: '1ª evaluación', date: '2026-12-18T00:00:00.000Z', group: { name: 'B1' } },
      },
    ]);
  });

  it('is private to each academy', async () => {
    const { body: a } = await http()
      .post(`/groups/${lauraGroup}/assessments`)
      .set(as(admin))
      .send({ name: 'Parcial', date: '2026-11-20' })
      .expect(201);
    await seedTenant(prisma, { slug: 'other', email: 'admin@other.local', password: 'TestPassword123!' });
    const res = await http()
      .post('/auth/login')
      .send({ tenantSlug: 'other', email: 'admin@other.local', password: 'TestPassword123!' })
      .expect(200);
    const other = as(res.body.accessToken);
    await http().get(`/groups/${lauraGroup}/assessments`).set(other).expect(404);
    await http().get(`/assessments/${a.id}`).set(other).expect(404);
  });
});
