import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { reminderHtml, reminderSubject } from './reminder-email';

const DAY_MS = 86_400_000;

@Injectable()
export class RemindersService {
  /** Minimum days between two reminders for the same invoice. */
  static readonly INTERVAL_DAYS = 7;
  /** Never send more than this many reminders per invoice. */
  static readonly MAX_REMINDERS = 3;

  private readonly webOrigin: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    config: ConfigService,
  ) {
    this.webOrigin = config.get<string>('WEB_ORIGIN') ?? 'http://localhost:3000';
  }

  /**
   * Emails families about OVERDUE invoices, for tenants that opted in.
   * Anti-spam: at most one every INTERVAL_DAYS and MAX_REMINDERS in total.
   * An invoice is only marked as reminded when the provider accepted the email
   * (so nothing is "used up" while email isn't configured).
   */
  async sendOverdueReminders(now: Date = new Date()) {
    const cutoff = new Date(now.getTime() - RemindersService.INTERVAL_DAYS * DAY_MS);

    const invoices = await this.prisma.invoice.findMany({
      where: {
        status: 'OVERDUE',
        reminderCount: { lt: RemindersService.MAX_REMINDERS },
        tenant: { remindersEnabled: true },
        OR: [{ lastReminderAt: null }, { lastReminderAt: { lt: cutoff } }],
      },
      include: {
        tenant: {
          select: { name: true, legalName: true, contactEmail: true, contactPhone: true },
        },
        student: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            guardians: { select: { email: true, userId: true } },
          },
        },
      },
    });

    let sent = 0;
    let skipped = 0;

    for (const inv of invoices) {
      const guardianEmails = [
        ...new Set(
          inv.student.guardians
            .map((g) => g.email?.trim().toLowerCase())
            .filter((e): e is string => !!e),
        ),
      ];
      const to = guardianEmails.length
        ? guardianEmails
        : inv.student.email
          ? [inv.student.email]
          : [];
      if (to.length === 0) {
        skipped++;
        continue;
      }

      const data = {
        academy: inv.tenant.legalName ?? inv.tenant.name,
        studentName: `${inv.student.firstName} ${inv.student.lastName}`,
        invoiceNumber: inv.number,
        pending: Number(inv.amount.sub(inv.paidAmount)),
        dueDate: inv.dueDate,
        contactEmail: inv.tenant.contactEmail,
        contactPhone: inv.tenant.contactPhone,
        portalUrl: inv.student.guardians.some((g) => g.userId)
          ? `${this.webOrigin}/login`
          : null,
      };

      const ok = await this.email.send(to, reminderSubject(data), reminderHtml(data));
      if (!ok) {
        skipped++;
        continue;
      }

      await this.prisma.invoice.update({
        where: { id: inv.id },
        data: { lastReminderAt: now, reminderCount: { increment: 1 } },
      });
      sent++;
    }

    return { candidates: invoices.length, sent, skipped };
  }
}
