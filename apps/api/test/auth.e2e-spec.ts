import { INestApplication } from '@nestjs/common';
import * as argon2 from 'argon2';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapTestApp, resetDb } from './setup-e2e';

const TENANT_SLUG = 'acme';
const ADMIN_EMAIL = 'admin@acme.local';
const ADMIN_PASSWORD = 'TestPassword123!';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    const role = await prisma.role.create({
      data: { name: 'admin', description: 'Tenant admin', isSystem: true },
    });
    const tenant = await prisma.tenant.create({
      data: { slug: TENANT_SLUG, name: 'Acme' },
    });
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        roleId: role.id,
        email: ADMIN_EMAIL,
        passwordHash: await argon2.hash(ADMIN_PASSWORD),
        firstName: 'Admin',
        lastName: 'Acme',
      },
    });
  });

  function http() {
    return request(app.getHttpServer());
  }

  it('happy path: login → /users/me → refresh → logout → refresh revoked', async () => {
    const login = await http()
      .post('/auth/login')
      .send({ tenantSlug: TENANT_SLUG, email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(200);

    expect(login.body.accessToken).toEqual(expect.any(String));
    const setCookie = login.headers['set-cookie'] as unknown as string[];
    const refreshCookie = setCookie.find((c) => c.startsWith('refresh_token='))!;
    expect(refreshCookie).toContain('HttpOnly');
    expect(refreshCookie).toContain('SameSite=Strict');
    expect(refreshCookie).toContain('Path=/auth');

    const me = await http()
      .get('/users/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);
    expect(me.body).toMatchObject({
      email: ADMIN_EMAIL,
      role: 'admin',
      tenant: { slug: TENANT_SLUG },
    });

    const refreshed = await http()
      .post('/auth/refresh')
      .set('Cookie', refreshCookie)
      .expect(200);
    expect(refreshed.body.accessToken).toEqual(expect.any(String));

    await http()
      .post('/auth/logout')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(204);

    await http().post('/auth/refresh').set('Cookie', refreshCookie).expect(401);
  });

  it('rejects bad password with 401', async () => {
    await http()
      .post('/auth/login')
      .send({ tenantSlug: TENANT_SLUG, email: ADMIN_EMAIL, password: 'wrong___' })
      .expect(401);
  });

  it('rejects unknown tenant with 401', async () => {
    await http()
      .post('/auth/login')
      .send({ tenantSlug: 'ghost', email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(401);
  });

  it('rejects extra fields (whitelist) with 400', async () => {
    await http()
      .post('/auth/login')
      .send({
        tenantSlug: TENANT_SLUG,
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        extra: 'no',
      })
      .expect(400);
  });

  it('rejects /users/me without bearer with 401', async () => {
    await http().get('/users/me').expect(401);
  });
});
