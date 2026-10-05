const mockSend = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: mockSend } })),
}));

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapTestApp, resetDb, seedTenant } from './setup-e2e';

const PASSWORD = 'TestPassword123!';
const NEW_PASSWORD = 'BrandNewPass456!';

describe('Password reset & change (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    mockSend.mockReset();
    mockSend.mockResolvedValue({ data: { id: 'e' }, error: null });
    await resetDb(prisma);
    await seedTenant(prisma, { slug: 'acme', email: 'admin@acme.local', password: PASSWORD });
  });

  function http() {
    return request(app.getHttpServer());
  }

  function login(password: string) {
    return http()
      .post('/auth/login')
      .send({ tenantSlug: 'acme', email: 'admin@acme.local', password });
  }

  function forgot(email = 'admin@acme.local', tenantSlug = 'acme') {
    return http().post('/auth/forgot-password').send({ tenantSlug, email });
  }

  /** The token from the link in the most recent reset email. */
  function tokenFromLastEmail(): string {
    const html: string = mockSend.mock.calls.at(-1)[0].html;
    const m = html.match(/reset-password\?token=([A-Za-z0-9_-]+)/);
    if (!m) throw new Error('no reset link in email');
    return m[1];
  }

  it('full flow: email link → new password works, old one does not, link is single-use', async () => {
    await forgot().expect(200, { ok: true });

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0].to).toEqual(['admin@acme.local']);
    const token = tokenFromLastEmail();

    // only the hash is stored, never the token itself
    const u = await prisma.user.findFirstOrThrow({ where: { email: 'admin@acme.local' } });
    expect(u.passwordResetTokenHash).not.toBe(token);
    expect(u.passwordResetTokenHash).toMatch(/^[0-9a-f]{64}$/);

    await http().post('/auth/reset-password').send({ token, password: NEW_PASSWORD }).expect(200);

    await login(NEW_PASSWORD).expect(200);
    await login(PASSWORD).expect(401);

    // reusing the same link fails
    await http()
      .post('/auth/reset-password')
      .send({ token, password: 'AnotherPass789!' })
      .expect(400);
  });

  it('does not reveal whether an account exists', async () => {
    await forgot('nobody@acme.local').expect(200, { ok: true });
    await forgot('admin@acme.local', 'ghost-academy').expect(200, { ok: true });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('rejects an expired link', async () => {
    await forgot().expect(200);
    const token = tokenFromLastEmail();
    await prisma.user.updateMany({
      where: { email: 'admin@acme.local' },
      data: { passwordResetExpiresAt: new Date(Date.now() - 1000) },
    });
    await http().post('/auth/reset-password').send({ token, password: NEW_PASSWORD }).expect(400);
    await login(PASSWORD).expect(200); // unchanged
  });

  it('rejects a made-up token and a weak password', async () => {
    await http()
      .post('/auth/reset-password')
      .send({ token: 'not-a-real-token', password: NEW_PASSWORD })
      .expect(400);

    await forgot().expect(200);
    await http()
      .post('/auth/reset-password')
      .send({ token: tokenFromLastEmail(), password: 'short' })
      .expect(400);
  });

  it('a reset signs out existing sessions', async () => {
    const res = await login(PASSWORD).expect(200);
    const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) =>
      c.startsWith('refresh_token='),
    )!;

    await forgot().expect(200);
    await http()
      .post('/auth/reset-password')
      .send({ token: tokenFromLastEmail(), password: NEW_PASSWORD })
      .expect(200);

    await http().post('/auth/refresh').set('Cookie', cookie).expect(401);
  });

  describe('change password (signed in)', () => {
    async function session() {
      const res = await login(PASSWORD).expect(200);
      const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) =>
        c.startsWith('refresh_token='),
      )!;
      return { token: res.body.accessToken as string, cookie };
    }

    it('changes it and rotates the session: old refresh token dies, new one works', async () => {
      const me = await session();

      const res = await http()
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${me.token}`)
        .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
        .expect(200);
      expect(res.body.accessToken).toEqual(expect.any(String));
      const newCookie = (res.headers['set-cookie'] as unknown as string[]).find((c) =>
        c.startsWith('refresh_token='),
      )!;

      // the pre-change refresh token no longer works (anyone holding it is out)…
      await http().post('/auth/refresh').set('Cookie', me.cookie).expect(401);
      // …while this session continues with the rotated one
      await http().post('/auth/refresh').set('Cookie', newCookie).expect(200);

      await login(PASSWORD).expect(401);
      await login(NEW_PASSWORD).expect(200);
    });

    it('wrong current password is a 400 (not 401) and changes nothing', async () => {
      const me = await session();
      await http()
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${me.token}`)
        .send({ currentPassword: 'WrongPass000!', newPassword: NEW_PASSWORD })
        .expect(400);
      await login(PASSWORD).expect(200);
    });

    it('requires authentication', async () => {
      await http()
        .post('/auth/change-password')
        .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
        .expect(401);
    });
  });
});
