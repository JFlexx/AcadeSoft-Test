import { INestApplication } from '@nestjs/common';
import * as argon2 from 'argon2';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapTestApp, resetDb } from './setup-e2e';

const TENANT_SLUG = 'acme';
const EMAIL = 'admin@acme.local';
const PASSWORD = 'TestPassword123!';

/** One session per signed-in device, with rotation and reuse detection. */
describe('Auth sessions (e2e)', () => {
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
    const role = await prisma.role.create({ data: { name: 'admin', isSystem: true } });
    const tenant = await prisma.tenant.create({ data: { slug: TENANT_SLUG, name: 'Acme' } });
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        roleId: role.id,
        email: EMAIL,
        passwordHash: await argon2.hash(PASSWORD),
        firstName: 'Admin',
        lastName: 'Acme',
      },
    });
  });

  function http() {
    return request(app.getHttpServer());
  }

  const cookieOf = (res: request.Response): string | undefined =>
    ((res.headers['set-cookie'] as unknown as string[] | undefined) ?? [])
      .find((c) => c.startsWith('refresh_token='))
      ?.split(';')[0];

  /** Signs in from one "device": its access token and refresh cookie. */
  async function signIn(userAgent = 'Laptop') {
    const res = await http()
      .post('/auth/login')
      .set('User-Agent', userAgent)
      .send({ tenantSlug: TENANT_SLUG, email: EMAIL, password: PASSWORD })
      .expect(200);
    return { token: res.body.accessToken as string, cookie: cookieOf(res)! };
  }

  const refresh = (cookie: string) => http().post('/auth/refresh').set('Cookie', cookie);

  it('keeps the computer and the phone signed in at once; signing out one leaves the other', async () => {
    const laptop = await signIn('Laptop');
    const phone = await signIn('Phone');
    expect(await prisma.authSession.count()).toBe(2);
    expect((await prisma.authSession.findMany()).map((s) => s.userAgent).sort()).toEqual([
      'Laptop',
      'Phone',
    ]);

    const laptopNext = cookieOf(await refresh(laptop.cookie).expect(200))!;
    const phoneNext = cookieOf(await refresh(phone.cookie).expect(200))!;

    await http().post('/auth/logout').set('Authorization', `Bearer ${phone.token}`).expect(204);
    await refresh(phoneNext).expect(401);
    await refresh(laptopNext).expect(200);
  });

  it('two tabs refreshing at once both get through, and the kept cookie still works', async () => {
    const { cookie } = await signIn();

    const [a, b] = await Promise.all([refresh(cookie), refresh(cookie)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(a.body.accessToken).toEqual(expect.any(String));
    expect(b.body.accessToken).toEqual(expect.any(String));

    // Exactly one of them rotated; the other leaves the browser's cookie alone.
    const rotated = [cookieOf(a), cookieOf(b)].filter(Boolean) as string[];
    expect(rotated).toHaveLength(1);
    await refresh(rotated[0]).expect(200);
  });

  it('an old refresh token showing up after the grace period ends the session', async () => {
    const { cookie: first } = await signIn();
    const second = cookieOf(await refresh(first).expect(200))!;

    // Within a few seconds the replaced token is still tolerated (no new cookie)…
    const tolerated = await refresh(first).expect(200);
    expect(cookieOf(tolerated)).toBeUndefined();

    // …but later it can only be a copy: the whole session is closed.
    await prisma.authSession.updateMany({ data: { rotatedAt: new Date(Date.now() - 60_000) } });
    await refresh(first).expect(401);
    await refresh(second).expect(401);
    expect(await prisma.authSession.count()).toBe(0);
  });

  it('changing the password signs out the other devices and keeps this one', async () => {
    const laptop = await signIn('Laptop');
    const phone = await signIn('Phone');

    const changed = await http()
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${laptop.token}`)
      .send({ currentPassword: PASSWORD, newPassword: 'OtraClave456!' })
      .expect(200);

    await refresh(phone.cookie).expect(401);
    await refresh(laptop.cookie).expect(401);
    await refresh(cookieOf(changed)!).expect(200);
    expect(await prisma.authSession.count()).toBe(1);
  });

  it('removing the user ends all their sessions', async () => {
    const { cookie } = await signIn();
    await prisma.user.deleteMany({ where: { email: EMAIL } });
    await refresh(cookie).expect(401);
    expect(await prisma.authSession.count()).toBe(0);
  });
});
