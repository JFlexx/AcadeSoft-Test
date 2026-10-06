import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapTestApp, resetDb, seedTenant, SeededTenant } from './setup-e2e';

describe('Teacher access (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let acme: SeededTenant;
  let adminToken: string;
  let laura: string; // teacher ids
  let carlos: string;
  let ids: Record<string, string>;

  const PASSWORD = 'ProfePass123!';
  const inHours = (h: number) => new Date(Date.now() + h * 3600_000);

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
    adminToken = await login('admin@acme.local', 'TestPassword123!');
    const t = acme.tenantId;

    laura = (await prisma.teacher.create({ data: { tenantId: t, firstName: 'Laura', lastName: 'Gil' } })).id;
    carlos = (await prisma.teacher.create({ data: { tenantId: t, firstName: 'Carlos', lastName: 'Ruiz' } })).id;
    const course = await prisma.course.create({ data: { tenantId: t, name: 'Inglés', color: '#ff0000' } });
    const g1 = await prisma.group.create({ data: { tenantId: t, courseId: course.id, teacherId: laura, name: 'B1' } });
    const g2 = await prisma.group.create({ data: { tenantId: t, courseId: course.id, teacherId: carlos, name: 'A2' } });

    const student = (firstName: string, lastName: string) =>
      prisma.student.create({ data: { tenantId: t, firstName, lastName } });
    const ana = await student('Ana', 'Alonso');
    const bea = await student('Bea', 'Bravo');
    const dani = await student('Dani', 'Díaz'); // dropped out of B1
    await prisma.enrollment.createMany({
      data: [
        { studentId: ana.id, groupId: g1.id },
        { studentId: bea.id, groupId: g1.id },
        { studentId: dani.id, groupId: g1.id, status: 'DROPPED' },
      ],
    });

    const session = (groupId: string, at: Date, data: Record<string, unknown> = {}) =>
      prisma.session.create({ data: { tenantId: t, groupId, scheduledAt: at, ...data } });
    ids = {
      ana: ana.id,
      bea: bea.id,
      dani: dani.id,
      own: (await session(g1.id, inHours(2))).id, // B1, inherits Laura
      covering: (await session(g2.id, inHours(3), { teacherId: laura })).id, // Laura covers A2
      coveredByOther: (await session(g1.id, inHours(4), { teacherId: carlos })).id,
      cancelled: (await session(g1.id, inHours(5), { status: 'CANCELLED' })).id,
      farAway: (await session(g1.id, inHours(24 * 30))).id,
    };
  });

  function http() {
    return request(app.getHttpServer());
  }
  async function login(email: string, password: string) {
    const res = await http().post('/auth/login').send({ tenantSlug: 'acme', email, password }).expect(200);
    return res.body.accessToken as string;
  }
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function grantLaura() {
    await http()
      .post(`/teachers/${laura}/access`)
      .set(as(adminToken))
      .send({ email: 'Laura@Acme.local', password: PASSWORD })
      .expect(201);
    return login('laura@acme.local', PASSWORD);
  }

  it('admin grants access; the teacher logs in with role teacher', async () => {
    const before = await http().get(`/teachers/${laura}/access`).set(as(adminToken)).expect(200);
    expect(before.body).toEqual({ access: null });

    const token = await grantLaura();
    const profile = await http().get('/users/me').set(as(token)).expect(200);
    expect(profile.body.role).toBe('teacher');

    const me = await http().get('/teacher/me').set(as(token)).expect(200);
    expect(me.body).toMatchObject({ id: laura, firstName: 'Laura', academy: 'acme' });

    const after = await http().get(`/teachers/${laura}/access`).set(as(adminToken)).expect(200);
    expect(after.body.access.email).toBe('laura@acme.local');
  });

  it('rejects a second login for the same teacher, or an email in use', async () => {
    await grantLaura();
    await http()
      .post(`/teachers/${laura}/access`)
      .set(as(adminToken))
      .send({ email: 'otra@acme.local', password: PASSWORD })
      .expect(409);
    await http()
      .post(`/teachers/${carlos}/access`)
      .set(as(adminToken))
      .send({ email: 'admin@acme.local', password: PASSWORD })
      .expect(409);
    await http()
      .post(`/teachers/${carlos}/access`)
      .set(as(adminToken))
      .send({ email: 'carlos@acme.local', password: 'corta' })
      .expect(400);
  });

  it('a teacher cannot use the admin app or the family portal', async () => {
    const token = await grantLaura();
    await http().get('/students').set(as(token)).expect(403);
    await http().get('/invoices').set(as(token)).expect(403);
    await http().get('/portal/students').set(as(token)).expect(403);
    // …and an admin cannot use the teacher app.
    await http().get('/teacher/sessions').set(as(adminToken)).expect(403);
  });

  it('lists only their classes for the coming week, including covers', async () => {
    const token = await grantLaura();
    const res = await http().get('/teacher/sessions').set(as(token)).expect(200);
    const listed = res.body.map((s: { id: string }) => s.id);
    expect(listed).toEqual([ids.own, ids.covering, ids.cancelled]);
    expect(res.body[0]).toMatchObject({
      group: { name: 'B1', course: { name: 'Inglés', color: '#ff0000' } },
      enrolled: 2,
      marked: 0,
    });

    // A wider range reaches the far-away class.
    const wide = await http()
      .get('/teacher/sessions')
      .query({ from: new Date().toISOString(), to: inHours(24 * 40).toISOString() })
      .set(as(token))
      .expect(200);
    expect(wide.body.map((s: { id: string }) => s.id)).toContain(ids.farAway);
  });

  it('shows the roster (active students) and hides other teachers’ classes', async () => {
    const token = await grantLaura();
    const res = await http().get(`/teacher/sessions/${ids.own}`).set(as(token)).expect(200);
    expect(res.body.students.map((s: { firstName: string }) => s.firstName)).toEqual(['Ana', 'Bea']);
    expect(res.body.students[0].attendance).toBeNull();

    await http().get(`/teacher/sessions/${ids.coveredByOther}`).set(as(token)).expect(404);
  });

  it('saves attendance and returns the updated roster', async () => {
    const token = await grantLaura();
    const res = await http()
      .put(`/teacher/sessions/${ids.own}/attendance`)
      .set(as(token))
      .send({
        items: [
          { studentId: ids.ana, status: 'PRESENT' },
          { studentId: ids.bea, status: 'ABSENT', notes: 'Avisó por la mañana' },
        ],
      })
      .expect(200);
    expect(res.body.students).toEqual([
      expect.objectContaining({ firstName: 'Ana', attendance: { status: 'PRESENT', notes: null } }),
      expect.objectContaining({
        firstName: 'Bea',
        attendance: { status: 'ABSENT', notes: 'Avisó por la mañana' },
      }),
    ]);

    // Correcting it later works too.
    await http()
      .put(`/teacher/sessions/${ids.own}/attendance`)
      .set(as(token))
      .send({ items: [{ studentId: ids.bea, status: 'LATE' }] })
      .expect(200);
    const list = await http().get('/teacher/sessions').set(as(token));
    expect(list.body[0].marked).toBe(2);
    const bea = await prisma.attendance.findFirstOrThrow({ where: { studentId: ids.bea } });
    expect(bea).toMatchObject({ status: 'LATE', notes: null });
  });

  it('rejects attendance outside the roster, duplicated, cancelled or not theirs', async () => {
    const token = await grantLaura();
    const put = (id: string, items: object[]) =>
      http().put(`/teacher/sessions/${id}/attendance`).set(as(token)).send({ items });
    await put(ids.own, [{ studentId: ids.dani, status: 'PRESENT' }]).expect(400);
    await put(ids.own, [
      { studentId: ids.ana, status: 'PRESENT' },
      { studentId: ids.ana, status: 'ABSENT' },
    ]).expect(400);
    await put(ids.cancelled, [{ studentId: ids.ana, status: 'PRESENT' }]).expect(400);
    await put(ids.coveredByOther, [{ studentId: ids.ana, status: 'PRESENT' }]).expect(404);
    await put(ids.own, [{ studentId: ids.ana, status: 'HERE' }]).expect(400);
  });

  it('revoking access removes the login but keeps the teacher', async () => {
    await grantLaura();
    await http().delete(`/teachers/${laura}/access`).set(as(adminToken)).expect(204);
    await http()
      .post('/auth/login')
      .send({ tenantSlug: 'acme', email: 'laura@acme.local', password: PASSWORD })
      .expect(401);
    expect(await prisma.teacher.findUnique({ where: { id: laura } })).not.toBeNull();
    await http().delete(`/teachers/${laura}/access`).set(as(adminToken)).expect(404);
  });

  it('deleting the teacher deletes their login', async () => {
    await grantLaura();
    await http().delete(`/teachers/${laura}`).set(as(adminToken)).expect(204);
    expect(await prisma.user.findFirst({ where: { email: 'laura@acme.local' } })).toBeNull();
  });

  it("can't manage another academy's teacher", async () => {
    await seedTenant(prisma, { slug: 'other', email: 'admin@other.local', password: 'TestPassword123!' });
    const res = await http()
      .post('/auth/login')
      .send({ tenantSlug: 'other', email: 'admin@other.local', password: 'TestPassword123!' })
      .expect(200);
    const other = as(res.body.accessToken);
    await http().get(`/teachers/${laura}/access`).set(other).expect(404);
    await http()
      .post(`/teachers/${laura}/access`)
      .set(other)
      .send({ email: 'x@other.local', password: PASSWORD })
      .expect(404);
  });
});
