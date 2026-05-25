import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapTestApp, resetDb } from './setup-e2e';

describe('Signup (e2e)', () => {
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
    // Note: no pre-existing tenant/role — signup must bootstrap them itself.
  });

  function http() {
    return request(app.getHttpServer());
  }

  const validPayload = {
    tenantName: 'New Academy',
    tenantSlug: 'new-academy',
    firstName: 'Jane',
    lastName: 'Owner',
    email: 'jane@new-academy.local',
    password: 'StrongPass123!',
  };

  it('creates tenant + admin and returns access token', async () => {
    const res = await http().post('/auth/signup').send(validPayload).expect(201);

    expect(res.body.accessToken).toEqual(expect.any(String));
    const setCookie = res.headers['set-cookie'] as unknown as string[];
    expect(setCookie.find((c) => c.startsWith('refresh_token='))).toBeDefined();

    const tenant = await prisma.tenant.findUnique({
      where: { slug: 'new-academy' },
    });
    expect(tenant?.name).toBe('New Academy');

    const user = await prisma.user.findFirst({
      where: { email: 'jane@new-academy.local' },
      include: { role: true },
    });
    expect(user?.firstName).toBe('Jane');
    expect(user?.role.name).toBe('admin');
    expect(user?.tenantId).toBe(tenant?.id);
  });

  it('returns a token usable for authenticated requests', async () => {
    const signup = await http().post('/auth/signup').send(validPayload).expect(201);
    const me = await http()
      .get('/users/me')
      .set('Authorization', `Bearer ${signup.body.accessToken}`)
      .expect(200);
    expect(me.body.email).toBe('jane@new-academy.local');
    expect(me.body.role).toBe('admin');
    expect(me.body.tenant?.slug).toBe('new-academy');
  });

  it('rejects duplicate slug with 409', async () => {
    await http().post('/auth/signup').send(validPayload).expect(201);
    await http()
      .post('/auth/signup')
      .send({
        ...validPayload,
        email: 'other@example.local',
        firstName: 'Other',
        lastName: 'Person',
      })
      .expect(409);
  });

  it('rejects invalid slug format with 400', async () => {
    await http()
      .post('/auth/signup')
      .send({ ...validPayload, tenantSlug: 'Invalid Slug!' })
      .expect(400);
    await http()
      .post('/auth/signup')
      .send({ ...validPayload, tenantSlug: '-leading-dash' })
      .expect(400);
    await http()
      .post('/auth/signup')
      .send({ ...validPayload, tenantSlug: 'UPPERCASE' })
      .expect(400);
  });

  it('rejects weak password with 400', async () => {
    await http()
      .post('/auth/signup')
      .send({ ...validPayload, password: 'short' })
      .expect(400);
  });

  it('rejects invalid email with 400', async () => {
    await http()
      .post('/auth/signup')
      .send({ ...validPayload, email: 'not-an-email' })
      .expect(400);
  });

  it('rejects extra fields with 400 (whitelist)', async () => {
    await http()
      .post('/auth/signup')
      .send({ ...validPayload, role: 'superadmin' })
      .expect(400);
  });

  it('allows the same email across different tenants', async () => {
    await http().post('/auth/signup').send(validPayload).expect(201);
    await http()
      .post('/auth/signup')
      .send({
        ...validPayload,
        tenantName: 'Another Academy',
        tenantSlug: 'another-academy',
      })
      .expect(201);
  });
});
