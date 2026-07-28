import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapTestApp, resetDb, seedTenant, SeededTenant } from './setup-e2e';

describe('Public self-service enrollment (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let acme: SeededTenant;
  let adminToken: string;
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
    adminToken = await login();
    const course = await http()
      .post('/courses')
      .set(bearer(adminToken))
      .send({ name: 'Inglés' })
      .expect(201);
    const group = await http()
      .post('/groups')
      .set(bearer(adminToken))
      .send({ courseId: course.body.id, name: 'Inglés B1', maxCapacity: 10, monthlyFee: 55 })
      .expect(201);
    groupId = group.body.id;
  });

  function http() {
    return request(app.getHttpServer());
  }

  async function login(): Promise<string> {
    const res = await http()
      .post('/auth/login')
      .send({ tenantSlug: 'acme', email: 'admin@acme.local', password: 'TestPassword123!' })
      .expect(200);
    return res.body.accessToken;
  }

  function bearer(t: string) {
    return { Authorization: `Bearer ${t}` };
  }

  it('lists enrollable groups without authentication', async () => {
    const res = await http().get('/public/academy/acme/groups').expect(200);
    expect(res.body.academy).toBeDefined();
    expect(res.body.groups).toHaveLength(1);
    expect(res.body.groups[0]).toMatchObject({
      id: groupId,
      name: 'Inglés B1',
      course: 'Inglés',
      spotsAvailable: 10,
    });
  });

  it('accepts a public enrollment and files it as PENDING for review', async () => {
    const res = await http()
      .post('/public/academy/acme/enroll')
      .send({
        firstName: 'Ana',
        lastName: 'García',
        email: 'ana@example.com',
        groupId,
        guardianName: 'María García',
        guardianEmail: 'maria@example.com',
      })
      .expect(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.studentId).toBeDefined();

    // admin now sees the student and a PENDING enrollment
    const students = await http()
      .get('/students')
      .set(bearer(adminToken))
      .expect(200);
    expect(students.body).toHaveLength(1);
    expect(students.body[0].firstName).toBe('Ana');

    const pending = await http()
      .get('/enrollments?status=PENDING')
      .set(bearer(adminToken))
      .expect(200);
    expect(pending.body).toHaveLength(1);
    expect(pending.body[0].groupId).toBe(groupId);

    // a PENDING enrollment does not consume a spot
    const groups = await http().get('/public/academy/acme/groups').expect(200);
    expect(groups.body.groups[0].spotsAvailable).toBe(10);
  });

  it('rejects a full group', async () => {
    // a capacity-1 group, filled with one ACTIVE enrollment
    const course = await http()
      .post('/courses')
      .set(bearer(adminToken))
      .send({ name: 'Piano' })
      .expect(201);
    const small = await http()
      .post('/groups')
      .set(bearer(adminToken))
      .send({ courseId: course.body.id, name: 'Piano 1:1', maxCapacity: 1 })
      .expect(201);
    const student = await http()
      .post('/students')
      .set(bearer(adminToken))
      .send({ firstName: 'Ya', lastName: 'Inscrito' })
      .expect(201);
    await http()
      .post('/enrollments')
      .set(bearer(adminToken))
      .send({ studentId: student.body.id, groupId: small.body.id, status: 'ACTIVE' })
      .expect(201);

    await http()
      .post('/public/academy/acme/enroll')
      .send({ firstName: 'Nuevo', lastName: 'Alumno', groupId: small.body.id })
      .expect(400);
  });

  it('rejects an unknown academy (404) and an invalid group (400)', async () => {
    await http().get('/public/academy/ghost/groups').expect(404);
    await http()
      .post('/public/academy/ghost/enroll')
      .send({ firstName: 'X', lastName: 'Y', groupId })
      .expect(404);
    await http()
      .post('/public/academy/acme/enroll')
      .send({ firstName: 'X', lastName: 'Y', groupId: 'nope' })
      .expect(400);
  });

  it('validates the submission (400)', async () => {
    await http()
      .post('/public/academy/acme/enroll')
      .send({ firstName: 'SoloNombre', groupId })
      .expect(400);
    await http()
      .post('/public/academy/acme/enroll')
      .send({ firstName: 'Ana', lastName: 'García' })
      .expect(400);
  });

  it('does not leak other tenants groups', async () => {
    const beta = await seedTenant(prisma, {
      slug: 'beta',
      email: 'admin@beta.local',
      password: 'TestPassword123!',
    });
    void beta;
    const res = await http().get('/public/academy/beta/groups').expect(200);
    expect(res.body.groups).toHaveLength(0);
  });
});
