const mockSend = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: mockSend } })),
}));

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapTestApp, resetDb, seedTenant, SeededTenant } from './setup-e2e';

describe('Waiting list (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let acme: SeededTenant;
  let admin: string;
  let fullGroup: string; // capacity 1, already taken
  let openGroup: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    mockSend.mockReset();
    mockSend.mockResolvedValue({ data: { id: 'email_1' }, error: null });
    await resetDb(prisma);
    acme = await seedTenant(prisma, {
      slug: 'acme',
      email: 'admin@acme.local',
      password: 'TestPassword123!',
    });
    const t = acme.tenantId;
    await prisma.tenant.update({
      where: { id: t },
      data: { name: 'Academia Acme', contactEmail: 'secretaria@acme.es' },
    });
    const res = await http()
      .post('/auth/login')
      .send({ tenantSlug: 'acme', email: 'admin@acme.local', password: 'TestPassword123!' })
      .expect(200);
    admin = res.body.accessToken;

    const course = await prisma.course.create({ data: { tenantId: t, name: 'Piano' } });
    fullGroup = (
      await prisma.group.create({
        data: { tenantId: t, courseId: course.id, name: 'Piano individual', maxCapacity: 1 },
      })
    ).id;
    openGroup = (
      await prisma.group.create({
        data: { tenantId: t, courseId: course.id, name: 'Piano grupo', maxCapacity: 5 },
      })
    ).id;
    const taken = await prisma.student.create({
      data: { tenantId: t, firstName: 'Ya', lastName: 'Inscrito' },
    });
    await prisma.enrollment.create({ data: { studentId: taken.id, groupId: fullGroup } });
  });

  function http() {
    return request(app.getHttpServer());
  }
  const as = () => ({ Authorization: `Bearer ${admin}` });

  function apply(groupId: string, extra: Record<string, unknown> = {}, name = 'Ana') {
    return http()
      .post('/public/academy/acme/enroll')
      .send({ acceptPrivacy: true,
        firstName: name,
        lastName: 'García',
        groupId,
        guardianName: 'María García',
        guardianEmail: `${name.toLowerCase()}-familia@example.com`,
        ...extra,
      });
  }

  it('a full group still rejects a plain request', async () => {
    const res = await apply(fullGroup).expect(400);
    expect(res.body.message).toMatch(/completo/);
  });

  it('joins the waiting list in order when asked to', async () => {
    const first = await apply(fullGroup, { waitlist: true }).expect(201);
    expect(first.body).toMatchObject({ ok: true, waitlisted: true, position: 1 });
    const second = await apply(fullGroup, { waitlist: true }, 'Bea').expect(201);
    expect(second.body.position).toBe(2);

    const rows = await prisma.enrollment.findMany({
      where: { groupId: fullGroup, status: 'WAITLIST' },
    });
    expect(rows).toHaveLength(2);

    // Waiting doesn't take a spot: the group still shows as full, not over.
    const groups = await http().get('/public/academy/acme/groups').expect(200);
    const g = groups.body.groups.find((x: { id: string }) => x.id === fullGroup);
    expect(g.spotsAvailable).toBe(0);
  });

  it('with spots left, waitlist:true is just a normal request', async () => {
    const res = await apply(openGroup, { waitlist: true }).expect(201);
    expect(res.body.waitlisted).toBe(false);
    const row = await prisma.enrollment.findUniqueOrThrow({ where: { id: res.body.enrollmentId } });
    expect(row.status).toBe('PENDING');
  });

  it('the admin can filter the waiting list', async () => {
    await apply(fullGroup, { waitlist: true }).expect(201);
    const res = await http()
      .get('/enrollments')
      .query({ groupId: fullGroup, status: 'WAITLIST' })
      .set(as())
      .expect(200);
    expect(res.body).toHaveLength(1);
  });

  it('offering the spot emails the family and records when', async () => {
    const { body } = await apply(fullGroup, { waitlist: true }).expect(201);
    const res = await http()
      .post(`/enrollments/${body.enrollmentId}/offer-spot`)
      .set(as())
      .expect(200);
    expect(res.body.spotOfferedAt).not.toBeNull();

    expect(mockSend).toHaveBeenCalledTimes(1);
    const mail = mockSend.mock.calls[0][0];
    expect(mail.to).toEqual(['ana-familia@example.com']);
    expect(mail.subject).toBe('Hay plaza en Piano individual — Academia Acme');
    expect(mail.replyTo).toBe('secretaria@acme.es');
    expect(mail.html).toContain('Ana García');
  });

  it('only offers to people on the waiting list, with an email', async () => {
    const pending = await apply(openGroup).expect(201);
    await http()
      .post(`/enrollments/${pending.body.enrollmentId}/offer-spot`)
      .set(as())
      .expect(400);

    const noEmail = await http()
      .post('/public/academy/acme/enroll')
      .send({ acceptPrivacy: true, firstName: 'Sin', lastName: 'Email', groupId: fullGroup, waitlist: true })
      .expect(201);
    const res = await http()
      .post(`/enrollments/${noEmail.body.enrollmentId}/offer-spot`)
      .set(as())
      .expect(400);
    expect(res.body.message).toMatch(/teléfono/);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('a failed email is reported and nothing is recorded', async () => {
    mockSend.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    const { body } = await apply(fullGroup, { waitlist: true }).expect(201);
    await http().post(`/enrollments/${body.enrollmentId}/offer-spot`).set(as()).expect(400);
    const row = await prisma.enrollment.findUniqueOrThrow({ where: { id: body.enrollmentId } });
    expect(row.spotOfferedAt).toBeNull();
  });

  it('giving the spot moves the enrollment date to that day', async () => {
    const { body } = await apply(fullGroup, { waitlist: true }).expect(201);
    const longAgo = new Date('2026-01-01T10:00:00Z');
    await prisma.enrollment.update({ where: { id: body.enrollmentId }, data: { enrolledAt: longAgo } });

    const res = await http()
      .patch(`/enrollments/${body.enrollmentId}`)
      .set(as())
      .send({ status: 'ACTIVE' })
      .expect(200);
    expect(res.body.status).toBe('ACTIVE');
    expect(new Date(res.body.enrolledAt).getTime()).toBeGreaterThan(longAgo.getTime());
  });

  it("can't offer a spot in another academy", async () => {
    const { body } = await apply(fullGroup, { waitlist: true }).expect(201);
    await seedTenant(prisma, { slug: 'other', email: 'admin@other.local', password: 'TestPassword123!' });
    const res = await http()
      .post('/auth/login')
      .send({ tenantSlug: 'other', email: 'admin@other.local', password: 'TestPassword123!' })
      .expect(200);
    await http()
      .post(`/enrollments/${body.enrollmentId}/offer-spot`)
      .set({ Authorization: `Bearer ${res.body.accessToken}` })
      .expect(404);
  });
});
