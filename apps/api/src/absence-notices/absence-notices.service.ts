import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { familyEmails } from '../email/family-emails';
import { absenceHtml, absenceSubject } from './absence-email';

const HOUR_MS = 3_600_000;
/** Only classes that started (or start within the hour) in the last day: */
const WINDOW_BEFORE_MS = 24 * HOUR_MS;
const WINDOW_AFTER_MS = HOUR_MS;

/**
 * Emails the family when a student is marked absent, for academies that
 * opted in. One notice per absence (Attendance.absenceNotifiedAt), and only
 * for recent classes: back-filling last month's attendance must not email
 * anyone. Never throws — taking attendance must not fail because of email.
 */
@Injectable()
export class AbsenceNoticesService {
  private readonly logger = new Logger(AbsenceNoticesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  /** Returns how many families were notified. */
  async notify(sessionId: string, studentIds: string[], now = new Date()): Promise<number> {
    if (studentIds.length === 0) return 0;
    try {
      return await this.send(sessionId, studentIds, now);
    } catch (err) {
      this.logger.error(`Absence notices failed for session ${sessionId}: ${String(err)}`);
      return 0;
    }
  }

  private async send(sessionId: string, studentIds: string[], now: Date) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        scheduledAt: true,
        group: { select: { name: true } },
        tenant: {
          select: {
            name: true,
            legalName: true,
            contactEmail: true,
            contactPhone: true,
            timezone: true,
            absenceNoticesEnabled: true,
          },
        },
      },
    });
    if (!session || !session.tenant.absenceNoticesEnabled) return 0;
    const t = session.scheduledAt.getTime();
    if (t < now.getTime() - WINDOW_BEFORE_MS || t > now.getTime() + WINDOW_AFTER_MS) return 0;

    const pending = await this.prisma.attendance.findMany({
      where: {
        sessionId,
        studentId: { in: studentIds },
        status: 'ABSENT',
        absenceNotifiedAt: null,
      },
      select: {
        id: true,
        student: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            guardians: { select: { email: true } },
          },
        },
      },
    });

    const { tenant } = session;
    const when = session.scheduledAt.toLocaleString('es-ES', {
      timeZone: tenant.timezone,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    });

    let sent = 0;
    for (const a of pending) {
      const to = familyEmails(a.student);
      if (to.length === 0) continue;
      const data = {
        academy: tenant.legalName ?? tenant.name,
        studentName: `${a.student.firstName} ${a.student.lastName}`,
        groupName: session.group.name,
        when,
        contactEmail: tenant.contactEmail,
        contactPhone: tenant.contactPhone,
      };
      const ok = await this.email.send(to, absenceSubject(data), absenceHtml(data), {
        fromName: tenant.name,
        replyTo: tenant.contactEmail,
      });
      if (!ok) continue;
      await this.prisma.attendance.update({
        where: { id: a.id },
        data: { absenceNotifiedAt: now },
      });
      sent++;
    }
    return sent;
  }
}
