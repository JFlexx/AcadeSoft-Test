import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapTestApp, resetDb, seedTenant, SeededTenant } from './setup-e2e';

describe('Family portal (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let acme: SeededTenant;
  let adminToken: string;

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
  });

  function http() {
    return request(app.getHttpServer());
  }

  async function login(email: string, password: string): Promise<string> {
    const res = await http()
      .post('/auth/login')
      .send({ tenantSlug: 'acme', email, password })
      .expect(200);
    return res.body.accessToken;
  }

  function bearer(t: string) {
    return { Authorization: `Bearer ${t}` };
  }

  async function createStudent(firstName: string, lastName: string) {
    const res = await http()
      .post('/students')
      .set(bearer(adminToken))
      .send({ firstName, lastName })
      .expect(201);
    return res.body.id as string;
  }

  function grant(studentId: string, email: string, extra = {}) {
    return http()
      .post(`/students/${studentId}/portal-access`)
      .set(bearer(adminToken))
      .send({
        firstName: 'Madre',
        lastName: 'Demo',
        email,
        password: 'FamilyPass123!',
        ...extra,
      });
  }

  it('admin grants access and the guardian sees only their child', async () => {
    const ana = await createStudent('Ana', 'García');
    const otherStudent = await createStudent('Otra', 'Persona');

    // give Ana an invoice so it shows up in the portal
    await http()
      .post('/invoices')
      .set(bearer(adminToken))
      .send({ studentId: ana, amount: 50, description: 'Mensualidad' })
      .expect(201);

    await grant(ana, 'madre@example.com').expect(201);

    const guardianToken = await login('madre@example.com', 'FamilyPass123!');
    const res = await http()
      .get('/portal/students')
      .set(bearer(guardianToken))
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].firstName).toBe('Ana');
    expect(res.body[0].invoices).toHaveLength(1);
    expect(Array.isArray(res.body[0].enrollments)).toBe(true);
    expect(Array.isArray(res.body[0].attendances)).toBe(true);
    // never the other student
    expect(
      res.body.some((s: { firstName: string }) => s.firstName === 'Otra'),
    ).toBe(false);

    void otherStudent;
  });

  it('reuses the same guardian login across siblings (multi-child)', async () => {
    const lucia = await createStudent('Lucía', 'Fernández');
    const pablo = await createStudent('Pablo', 'Fernández');

    await grant(lucia, 'familia@example.com').expect(201);
    await grant(pablo, 'familia@example.com').expect(201);

    const token = await login('familia@example.com', 'FamilyPass123!');
    const res = await http()
      .get('/portal/students')
      .set(bearer(token))
      .expect(200);
    expect(res.body).toHaveLength(2);
  });

  it('a guardian cannot reach admin resources but can read their profile', async () => {
    const ana = await createStudent('Ana', 'García');
    await grant(ana, 'madre@example.com').expect(201);
    const token = await login('madre@example.com', 'FamilyPass123!');

    await http().get('/students').set(bearer(token)).expect(403);
    await http().get('/invoices').set(bearer(token)).expect(403);

    const me = await http().get('/users/me').set(bearer(token)).expect(200);
    expect(me.body.role).toBe('guardian');
  });

  it('an admin cannot use the guardian portal (403)', async () => {
    await http().get('/portal/students').set(bearer(adminToken)).expect(403);
  });

  it('validates grant input and conflicts', async () => {
    const ana = await createStudent('Ana', 'García');

    // unknown student
    await grant('does-not-exist', 'x@example.com').expect(404);
    // weak password
    await grant(ana, 'x@example.com', { password: 'short' }).expect(400);
    // duplicate link
    await grant(ana, 'madre@example.com').expect(201);
    await grant(ana, 'madre@example.com').expect(409);
    // email belongs to a non-guardian (the admin)
    await grant(ana, 'admin@acme.local').expect(409);
  });

  it('requires authentication on the portal', async () => {
    await http().get('/portal/students').expect(401);
  });

  it('lists and revokes portal access', async () => {
    const ana = await createStudent('Ana', 'García');
    const g = await grant(ana, 'madre@example.com').expect(201);

    const list = await http()
      .get(`/students/${ana}/portal-access`)
      .set(bearer(adminToken))
      .expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].email).toBe('madre@example.com');

    // guardian works before revoke
    const token = await login('madre@example.com', 'FamilyPass123!');
    await http().get('/portal/students').set(bearer(token)).expect(200);

    await http()
      .delete(`/students/${ana}/portal-access/${g.body.id}`)
      .set(bearer(adminToken))
      .expect(204);

    const after = await http()
      .get(`/students/${ana}/portal-access`)
      .set(bearer(adminToken))
      .expect(200);
    expect(after.body).toHaveLength(0);

    // was their only child → login removed
    await http()
      .post('/auth/login')
      .send({ tenantSlug: 'acme', email: 'madre@example.com', password: 'FamilyPass123!' })
      .expect(401);
  });

  it('revoking one child keeps access to the siblings', async () => {
    const lucia = await createStudent('Lucía', 'Fernández');
    const pablo = await createStudent('Pablo', 'Fernández');
    const g1 = await grant(lucia, 'familia@example.com').expect(201);
    await grant(pablo, 'familia@example.com').expect(201);

    await http()
      .delete(`/students/${lucia}/portal-access/${g1.body.id}`)
      .set(bearer(adminToken))
      .expect(204);

    const token = await login('familia@example.com', 'FamilyPass123!');
    const res = await http().get('/portal/students').set(bearer(token)).expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].firstName).toBe('Pablo');
  });

  it('revoke validates ownership (404 for an unknown link)', async () => {
    const ana = await createStudent('Ana', 'García');
    await http()
      .delete(`/students/${ana}/portal-access/nope`)
      .set(bearer(adminToken))
      .expect(404);
  });
});
