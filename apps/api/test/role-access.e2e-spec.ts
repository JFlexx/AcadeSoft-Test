import { INestApplication } from '@nestjs/common';
import * as argon2 from 'argon2';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapTestApp, resetDb, seedTenant, SeededTenant } from './setup-e2e';

// Admin-only controllers must reject non-admin roles (the foundation for the
// upcoming family/guardian portal: a low-privilege user must not be able to
// read the academy's data).
describe('Role-based access control (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let acme: SeededTenant;
  let adminToken: string;
  let teacherToken: string;

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

    // A second, non-admin user in the same tenant.
    const teacherRole = await prisma.role.upsert({
      where: { name: 'teacher' },
      update: {},
      create: { name: 'teacher', isSystem: true },
    });
    await prisma.user.create({
      data: {
        tenantId: acme.tenantId,
        roleId: teacherRole.id,
        email: 'teacher@acme.local',
        passwordHash: await argon2.hash('TestPassword123!'),
        firstName: 'Tea',
        lastName: 'Cher',
      },
    });
    teacherToken = await login('teacher@acme.local', 'TestPassword123!');
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

  it('admin can read admin-only resources', async () => {
    await http().get('/students').set(bearer(adminToken)).expect(200);
    await http().get('/invoices').set(bearer(adminToken)).expect(200);
    await http().get('/settings').set(bearer(adminToken)).expect(200);
  });

  it('non-admin (teacher) is forbidden on admin-only resources', async () => {
    await http().get('/students').set(bearer(teacherToken)).expect(403);
    await http()
      .post('/students')
      .set(bearer(teacherToken))
      .send({ firstName: 'X', lastName: 'Y' })
      .expect(403);
    await http().get('/invoices').set(bearer(teacherToken)).expect(403);
    await http().get('/teachers').set(bearer(teacherToken)).expect(403);
    await http().get('/settings').set(bearer(teacherToken)).expect(403);
  });

  it('any authenticated user can read their own profile', async () => {
    const res = await http()
      .get('/users/me')
      .set(bearer(teacherToken))
      .expect(200);
    expect(res.body.email).toBe('teacher@acme.local');
    expect(res.body.role).toBe('teacher');
  });

  it('still rejects unauthenticated requests', async () => {
    await http().get('/students').expect(401);
  });
});
