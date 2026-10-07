import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapTestApp, resetDb, seedTenant, SeededTenant } from './setup-e2e';

describe('Rooms (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let acme: SeededTenant;
  let admin: string;
  let g1: string;
  let g2: string;

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
    const res = await http()
      .post('/auth/login')
      .send({ tenantSlug: 'acme', email: 'admin@acme.local', password: 'TestPassword123!' })
      .expect(200);
    admin = res.body.accessToken;
    const course = await prisma.course.create({ data: { tenantId: acme.tenantId, name: 'Inglés' } });
    g1 = (await prisma.group.create({ data: { tenantId: acme.tenantId, courseId: course.id, name: 'B1' } })).id;
    g2 = (await prisma.group.create({ data: { tenantId: acme.tenantId, courseId: course.id, name: 'A2' } })).id;
  });

  function http() {
    return request(app.getHttpServer());
  }
  const auth = () => ({ Authorization: `Bearer ${admin}` });
  const room = async (name: string, capacity?: number) =>
    (await http().post('/rooms').set(auth()).send({ name, capacity }).expect(201)).body.id as string;
  const session = (groupId: string, at: string, data: Record<string, unknown> = {}) =>
    prisma.session.create({ data: { tenantId: acme.tenantId, groupId, scheduledAt: new Date(at), ...data } });

  it('creates, lists, renames and deletes rooms', async () => {
    const r = await room('Aula 1', 12);
    await http().post('/rooms').set(auth()).send({ name: 'Aula 1' }).expect(409);
    await http().post('/rooms').set(auth()).send({ name: 'X', capacity: 0 }).expect(400);
    await http().patch(`/rooms/${r}`).set(auth()).send({ name: 'Aula Azul' }).expect(200);
    const list = await http().get('/rooms').set(auth()).expect(200);
    expect(list.body).toEqual([expect.objectContaining({ name: 'Aula Azul', capacity: 12 })]);
    await http().delete(`/rooms/${r}`).set(auth()).expect(204);
    expect((await http().get('/rooms').set(auth())).body).toEqual([]);
  });

  it('a group has a usual room; deleting the room clears it', async () => {
    const r = await room('Aula 1');
    const upd = await http().patch(`/groups/${g1}`).set(auth()).send({ roomId: r }).expect(200);
    expect(upd.body.roomId).toBe(r);
    await http().patch(`/groups/${g1}`).set(auth()).send({ roomId: 'nope' }).expect(400);
    await http().delete(`/rooms/${r}`).set(auth()).expect(204);
    expect((await prisma.group.findUniqueOrThrow({ where: { id: g1 } })).roomId).toBeNull();
  });

  it('reports classes that overlap in the same room', async () => {
    const r1 = await room('Aula 1');
    const r2 = await room('Aula 2');
    await prisma.group.updateMany({ where: { id: { in: [g1, g2] } }, data: { roomId: r1 } });

    const a = await session(g1, '2026-11-02T16:00:00Z', { durationMinutes: 60 }); // 17:00–18:00
    const b = await session(g2, '2026-11-02T16:30:00Z', { durationMinutes: 30 }); // 17:30–18:00, overlaps
    await session(g2, '2026-11-02T17:00:00Z'); // 18:00, just after: no clash
    await session(g2, '2026-11-02T16:15:00Z', { roomId: r2 }); // moved to another room
    await session(g2, '2026-11-02T16:10:00Z', { status: 'CANCELLED' }); // cancelled

    const res = await http()
      .get('/rooms/conflicts')
      .query({ from: '2026-11-01', to: '2026-11-30' })
      .set(auth())
      .expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      room: { id: r1, name: 'Aula 1' },
      a: { sessionId: a.id, group: { name: 'B1' } },
      b: { sessionId: b.id, group: { name: 'A2' } },
    });
  });

  it('a class can be moved to another room', async () => {
    const r1 = await room('Aula 1');
    const s = await http()
      .post('/sessions')
      .set(auth())
      .send({ groupId: g1, scheduledAt: '2026-11-02T16:00:00Z', roomId: r1 })
      .expect(201);
    expect(s.body.roomId).toBe(r1);
    const cleared = await http().patch(`/sessions/${s.body.id}`).set(auth()).send({ roomId: null }).expect(200);
    expect(cleared.body.roomId).toBeNull();
  });

  it('is private to each academy', async () => {
    const r = await room('Aula 1');
    await seedTenant(prisma, { slug: 'other', email: 'admin@other.local', password: 'TestPassword123!' });
    const res = await http()
      .post('/auth/login')
      .send({ tenantSlug: 'other', email: 'admin@other.local', password: 'TestPassword123!' })
      .expect(200);
    const other = { Authorization: `Bearer ${res.body.accessToken}` };
    expect((await http().get('/rooms').set(other)).body).toEqual([]);
    await http().patch(`/rooms/${r}`).set(other).send({ name: 'Hack' }).expect(404);
    await http().delete(`/rooms/${r}`).set(other).expect(404);
  });
});
