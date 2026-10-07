import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapTestApp, resetDb, seedTenant, SeededTenant } from './setup-e2e';

describe('Front office role / staff (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let acme: SeededTenant;
  let admin: string;

  const STAFF = { firstName: 'Sara', lastName: 'Recepción', email: 'Sara@Acme.local', password: 'Secretaria123!' };

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
  });

  function http() {
    return request(app.getHttpServer());
  }
  async function login(email: string, password: string) {
    const res = await http().post('/auth/login').send({ tenantSlug: 'acme', email, password }).expect(200);
    return res.body.accessToken as string;
  }
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  async function addStaff() {
    const res = await http().post('/team').set(as(admin)).send(STAFF).expect(201);
    return { id: res.body.id as string, token: await login('sara@acme.local', STAFF.password) };
  }

  it('the admin adds front-office users and sees the team', async () => {
    const { id } = await addStaff();
    const team = await http().get('/team').set(as(admin)).expect(200);
    expect(team.body).toEqual([
      expect.objectContaining({ email: 'admin@acme.local', role: 'admin', isMe: true }),
      expect.objectContaining({ id, email: 'sara@acme.local', role: 'staff', isMe: false }),
    ]);
    await http().post('/team').set(as(admin)).send(STAFF).expect(409);
    await http().post('/team').set(as(admin)).send({ ...STAFF, email: 'x@acme.local', password: 'corta' }).expect(400);
  });

  it('the front office runs the day to day', async () => {
    const { token } = await addStaff();
    const me = await http().get('/users/me').set(as(token)).expect(200);
    expect(me.body.role).toBe('staff');

    const student = await http()
      .post('/students')
      .set(as(token))
      .send({ firstName: 'Ana', lastName: 'Ruiz' })
      .expect(201);
    await http()
      .post('/invoices')
      .set(as(token))
      .send({ studentId: student.body.id, amount: 30, description: 'Libro' })
      .expect(201);
    await http().get('/invoices').set(as(token)).expect(200);
    await http().get('/reports/overview').query({ from: '2026-09-01', to: '2026-10-31' }).set(as(token)).expect(200);
    await http().post('/rooms').set(as(token)).send({ name: 'Aula 1' }).expect(201);
    await http().get('/settings').set(as(token)).expect(200); // read-only
  });

  it('but cannot change the academy settings, give access or manage the team', async () => {
    const { token } = await addStaff();
    await http().patch('/settings').set(as(token)).send({ name: 'Hackeada' }).expect(403);
    const teacher = await prisma.teacher.create({
      data: { tenantId: acme.tenantId, firstName: 'Laura', lastName: 'Gil' },
    });
    await http()
      .post(`/teachers/${teacher.id}/access`)
      .set(as(token))
      .send({ email: 'laura@acme.local', password: 'ProfePass123!' })
      .expect(403);
    await http().delete(`/teachers/${teacher.id}/access`).set(as(token)).expect(403);
    await http().get('/team').set(as(token)).expect(403);
    await http().post('/team').set(as(token)).send({ ...STAFF, email: 'otro@acme.local' }).expect(403);

    // The admin still can.
    await http().patch('/settings').set(as(admin)).send({ name: 'Academia Acme' }).expect(200);
  });

  it('removing a front-office user revokes their access; admins stay', async () => {
    const { id } = await addStaff();
    const team = await http().get('/team').set(as(admin));
    const me = team.body.find((u: { isMe: boolean }) => u.isMe);
    await http().delete(`/team/${me.id}`).set(as(admin)).expect(400);

    await http().delete(`/team/${id}`).set(as(admin)).expect(204);
    await http()
      .post('/auth/login')
      .send({ tenantSlug: 'acme', email: 'sara@acme.local', password: STAFF.password })
      .expect(401);
  });

  it("teams are private to each academy", async () => {
    const { id } = await addStaff();
    await seedTenant(prisma, { slug: 'other', email: 'admin@other.local', password: 'TestPassword123!' });
    const res = await http()
      .post('/auth/login')
      .send({ tenantSlug: 'other', email: 'admin@other.local', password: 'TestPassword123!' })
      .expect(200);
    const other = as(res.body.accessToken);
    const team = await http().get('/team').set(other).expect(200);
    expect(team.body.map((u: { email: string }) => u.email)).toEqual(['admin@other.local']);
    await http().delete(`/team/${id}`).set(other).expect(404);
  });
});
