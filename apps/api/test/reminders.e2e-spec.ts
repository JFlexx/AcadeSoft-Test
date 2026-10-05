const mockSend = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: mockSend } })),
}));

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { RemindersService } from '../src/reminders/reminders.service';
import { bootstrapTestApp, resetDb, seedTenant, SeededTenant } from './setup-e2e';

const DAY = 86_400_000;

describe('Overdue payment reminders (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reminders: RemindersService;
  let acme: SeededTenant;
  let token: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapTestApp());
    reminders = app.get(RemindersService);
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
    token = await login();
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

  async function enableReminders(enabled = true) {
    await http()
      .patch('/settings')
      .set(bearer(token))
      .send({ remindersEnabled: enabled })
      .expect(200);
  }

  /** An OVERDUE invoice for a student (optionally with a guardian email). */
  async function overdueInvoice(opts: { studentEmail?: string; guardianEmail?: string } = {}) {
    const s = await http()
      .post('/students')
      .set(bearer(token))
      .send({ firstName: 'Ana', lastName: 'García', ...(opts.studentEmail ? { email: opts.studentEmail } : {}) })
      .expect(201);
    if (opts.guardianEmail) {
      await prisma.guardian.create({
        data: {
          studentId: s.body.id,
          firstName: 'Madre',
          lastName: 'García',
          relationship: 'Madre',
          email: opts.guardianEmail,
        },
      });
    }
    const inv = await http()
      .post('/invoices')
      .set(bearer(token))
      .send({ studentId: s.body.id, amount: 60 })
      .expect(201);
    await prisma.invoice.update({ where: { id: inv.body.id }, data: { status: 'OVERDUE' } });
    return inv.body;
  }

  async function reminderState(id: string) {
    return prisma.invoice.findUniqueOrThrow({
      where: { id },
      select: { reminderCount: true, lastReminderAt: true },
    });
  }

  it('emails the guardian of an overdue invoice and records it', async () => {
    await enableReminders();
    const inv = await overdueInvoice({ studentEmail: 'ana@example.com', guardianEmail: 'madre@example.com' });

    const res = await reminders.sendOverdueReminders();
    expect(res).toMatchObject({ sent: 1, skipped: 0 });

    expect(mockSend).toHaveBeenCalledTimes(1);
    const arg = mockSend.mock.calls[0][0];
    expect(arg.to).toEqual(['madre@example.com']); // guardian preferred over student
    expect(arg.subject).toContain(inv.number);
    expect(arg.html).toContain('60,00');

    const st = await reminderState(inv.id);
    expect(st.reminderCount).toBe(1);
    expect(st.lastReminderAt).not.toBeNull();
  });

  it('falls back to the student email when there is no guardian email', async () => {
    await enableReminders();
    await overdueInvoice({ studentEmail: 'ana@example.com' });
    await reminders.sendOverdueReminders();
    expect(mockSend.mock.calls[0][0].to).toEqual(['ana@example.com']);
  });

  it('waits 7 days between reminders and stops after 3', async () => {
    await enableReminders();
    const inv = await overdueInvoice({ studentEmail: 'ana@example.com' });
    const t0 = Date.now();

    await reminders.sendOverdueReminders(new Date(t0));
    await reminders.sendOverdueReminders(new Date(t0 + 2 * DAY)); // too soon
    expect(mockSend).toHaveBeenCalledTimes(1);

    await reminders.sendOverdueReminders(new Date(t0 + 8 * DAY));
    await reminders.sendOverdueReminders(new Date(t0 + 16 * DAY));
    await reminders.sendOverdueReminders(new Date(t0 + 24 * DAY)); // cap reached
    expect(mockSend).toHaveBeenCalledTimes(3);
    expect((await reminderState(inv.id)).reminderCount).toBe(3);
  });

  it('sends nothing when the academy has not opted in', async () => {
    await overdueInvoice({ studentEmail: 'ana@example.com' }); // reminders off by default
    const res = await reminders.sendOverdueReminders();
    expect(res.candidates).toBe(0);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('skips invoices with no recipient and does not mark them', async () => {
    await enableReminders();
    const inv = await overdueInvoice(); // no emails at all
    const res = await reminders.sendOverdueReminders();
    expect(res).toMatchObject({ sent: 0, skipped: 1 });
    expect(mockSend).not.toHaveBeenCalled();
    expect((await reminderState(inv.id)).reminderCount).toBe(0);
  });

  it('does not mark the invoice when the provider rejects the email', async () => {
    await enableReminders();
    const inv = await overdueInvoice({ studentEmail: 'ana@example.com' });
    mockSend.mockResolvedValue({ data: null, error: { message: 'domain not verified' } });

    const res = await reminders.sendOverdueReminders();
    expect(res).toMatchObject({ sent: 0, skipped: 1 });
    expect((await reminderState(inv.id)).reminderCount).toBe(0); // retried next run
  });

  it('ignores invoices that are not overdue', async () => {
    await enableReminders();
    const s = await http()
      .post('/students')
      .set(bearer(token))
      .send({ firstName: 'Ana', lastName: 'G', email: 'ana@example.com' })
      .expect(201);
    await http()
      .post('/invoices')
      .set(bearer(token))
      .send({ studentId: s.body.id, amount: 30 })
      .expect(201); // PENDING
    const res = await reminders.sendOverdueReminders();
    expect(res.candidates).toBe(0);
  });
});
