const mockSend = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: mockSend } })),
}));

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapTestApp, resetDb, seedTenant, SeededTenant } from './setup-e2e';

describe('Messaging (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let acme: SeededTenant;
  let token: string;
  let groupId: string;

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
    acme = await seedTenant(prisma, {
      slug: 'acme',
      email: 'admin@acme.local',
      password: 'TestPassword123!',
    });
    token = await login('acme', 'admin@acme.local');
    await http()
      .patch('/settings')
      .set(bearer(token))
      .send({ name: 'Academia Acme', contactEmail: 'hola@acme.es' })
      .expect(200);
    groupId = await createGroup(token, 'Inglés B1');
  });

  function http() {
    return request(app.getHttpServer());
  }

  async function login(slug: string, email: string): Promise<string> {
    const res = await http()
      .post('/auth/login')
      .send({ tenantSlug: slug, email, password: 'TestPassword123!' })
      .expect(200);
    return res.body.accessToken;
  }

  function bearer(t: string) {
    return { Authorization: `Bearer ${t}` };
  }

  async function createGroup(t: string, name: string) {
    const c = await http().post('/courses').set(bearer(t)).send({ name: 'Curso' }).expect(201);
    const g = await http().post('/groups').set(bearer(t)).send({ courseId: c.body.id, name }).expect(201);
    return g.body.id as string;
  }

  /** Student enrolled in `groupId`, with optional emails. */
  async function member(
    firstName: string,
    opts: { email?: string; guardianEmail?: string; status?: string } = {},
  ) {
    const s = await http()
      .post('/students')
      .set(bearer(token))
      .send({ firstName, lastName: 'X', ...(opts.email ? { email: opts.email } : {}) })
      .expect(201);
    if (opts.guardianEmail) {
      await prisma.guardian.create({
        data: { studentId: s.body.id, firstName: 'Tutor', lastName: 'X', relationship: 'Madre', email: opts.guardianEmail },
      });
    }
    await http()
      .post('/enrollments')
      .set(bearer(token))
      .send({ studentId: s.body.id, groupId, status: opts.status ?? 'ACTIVE' })
      .expect(201);
    return s.body.id as string;
  }

  it('previews a group: guardians first, falls back to student, lists who has no email', async () => {
    await member('Ana', { email: 'ana@x.com', guardianEmail: 'madre.ana@x.com' });
    await member('Beto', { email: 'beto@x.com' });
    await member('Carla'); // no email at all
    await member('Dani', { email: 'dani@x.com', status: 'DROPPED' }); // not active

    const res = await http()
      .post('/messages/preview')
      .set(bearer(token))
      .send({ groupId })
      .expect(200);

    expect(res.body).toMatchObject({
      targetLabel: 'Grupo Inglés B1',
      recipients: 2, // madre.ana + beto
      withoutEmail: ['Carla X'],
      emailConfigured: true,
    });
  });

  it('emails siblings sharing a guardian only once', async () => {
    await member('Lucía', { guardianEmail: 'familia@x.com' });
    await member('Pablo', { guardianEmail: 'FAMILIA@x.com' });
    const res = await http().post('/messages/preview').set(bearer(token)).send({ groupId }).expect(200);
    expect(res.body.recipients).toBe(1);
  });

  it('sends one email per recipient, as the academy, with escaped body, and records it', async () => {
    await member('Ana', { guardianEmail: 'madre@x.com' });
    await member('Beto', { email: 'beto@x.com' });

    const res = await http()
      .post('/messages')
      .set(bearer(token))
      .send({ groupId, subject: 'Clase cancelada', body: 'Mañana no hay clase.\n<script>x</script>' })
      .expect(201);
    expect(res.body).toMatchObject({ recipients: 2, sent: 2, failed: 0 });

    expect(mockSend).toHaveBeenCalledTimes(2);
    const tos = mockSend.mock.calls.map((c) => c[0].to);
    expect(tos).toEqual(expect.arrayContaining([['madre@x.com'], ['beto@x.com']]));
    for (const [arg] of mockSend.mock.calls) {
      expect(arg.to).toHaveLength(1); // privacy: never several families together
      expect(arg.from).toBe('"Academia Acme" <onboarding@resend.dev>');
      expect(arg.replyTo).toBe('hola@acme.es');
      expect(arg.subject).toBe('Clase cancelada');
      expect(arg.html).toContain('&lt;script&gt;');
      expect(arg.html).not.toContain('<script>');
      expect(arg.html).toContain('Mañana no hay clase.<br>');
    }

    const history = await http().get('/messages').set(bearer(token)).expect(200);
    expect(history.body).toHaveLength(1);
    expect(history.body[0]).toMatchObject({
      subject: 'Clase cancelada',
      targetType: 'GROUP',
      targetLabel: 'Grupo Inglés B1',
      recipientCount: 2,
      sentCount: 2,
      failedCount: 0,
    });
  });

  it('sends to a single student', async () => {
    const id = await member('Ana', { email: 'ana@x.com' });
    const res = await http()
      .post('/messages')
      .set(bearer(token))
      .send({ studentId: id, subject: 'Hola', body: 'Texto' })
      .expect(201);
    expect(res.body.sent).toBe(1);
    expect(mockSend.mock.calls[0][0].to).toEqual(['ana@x.com']);
  });

  it('counts provider failures', async () => {
    await member('Ana', { email: 'ana@x.com' });
    mockSend.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const res = await http()
      .post('/messages')
      .set(bearer(token))
      .send({ groupId, subject: 'S', body: 'B' })
      .expect(201);
    expect(res.body).toMatchObject({ sent: 0, failed: 1 });
  });

  it('refuses when nobody has an email, and records nothing', async () => {
    await member('Carla');
    await http()
      .post('/messages')
      .set(bearer(token))
      .send({ groupId, subject: 'S', body: 'B' })
      .expect(400);
    const history = await http().get('/messages').set(bearer(token)).expect(200);
    expect(history.body).toHaveLength(0);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('validates input (400)', async () => {
    const id = await member('Ana', { email: 'ana@x.com' });
    // neither / both targets
    await http().post('/messages/preview').set(bearer(token)).send({}).expect(400);
    await http().post('/messages/preview').set(bearer(token)).send({ groupId, studentId: id }).expect(400);
    // subject with a line break (header injection), empty body
    await http()
      .post('/messages')
      .set(bearer(token))
      .send({ groupId, subject: 'Hola\r\nBcc: x@y.com', body: 'B' })
      .expect(400);
    await http().post('/messages').set(bearer(token)).send({ groupId, subject: 'S', body: '' }).expect(400);
  });

  it("can't target another academy's group or student (404) and requires auth", async () => {
    await seedTenant(prisma, { slug: 'beta', email: 'admin@beta.local', password: 'TestPassword123!' });
    const betaToken = await login('beta', 'admin@beta.local');
    const betaGroup = await createGroup(betaToken, 'Piano');

    await http().post('/messages/preview').set(bearer(token)).send({ groupId: betaGroup }).expect(404);
    await http().post('/messages').set(bearer(token)).send({ groupId: betaGroup, subject: 'S', body: 'B' }).expect(404);
    await http().get('/messages').expect(401);
  });
});
