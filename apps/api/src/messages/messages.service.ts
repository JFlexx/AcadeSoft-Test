import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MessageTarget } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { MessageTargetDto } from './dto/message-target.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { messageHtml } from './message-email';

/** Safety cap per message (also keeps us well inside provider quotas). */
const MAX_RECIPIENTS = 300;
/** Parallel sends — one email per recipient, a few at a time. */
const CONCURRENCY = 5;

const STUDENT_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  guardians: { select: { email: true } },
} as const;

type Resolved = {
  type: MessageTarget;
  id: string;
  label: string;
  recipients: string[];
  withoutEmail: string[];
};

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  /**
   * Who would receive a message: guardians' emails (falling back to the
   * student's), de-duplicated so siblings sharing a guardian get one email.
   */
  private async resolve(tenantId: string, dto: MessageTargetDto): Promise<Resolved> {
    if (!!dto.groupId === !!dto.studentId) {
      throw new BadRequestException('Indica un grupo o un alumno (solo uno)');
    }

    let students: {
      firstName: string;
      lastName: string;
      email: string | null;
      guardians: { email: string | null }[];
    }[];
    let type: MessageTarget;
    let id: string;
    let label: string;

    if (dto.groupId) {
      const group = await this.prisma.group.findFirst({
        where: { id: dto.groupId, tenantId },
        select: { id: true, name: true },
      });
      if (!group) throw new NotFoundException('Grupo no encontrado');
      const enrollments = await this.prisma.enrollment.findMany({
        where: { groupId: group.id, status: 'ACTIVE' },
        select: { student: { select: STUDENT_SELECT } },
      });
      students = enrollments.map((e) => e.student);
      type = 'GROUP';
      id = group.id;
      label = `Grupo ${group.name}`;
    } else {
      const student = await this.prisma.student.findFirst({
        where: { id: dto.studentId, tenantId },
        select: STUDENT_SELECT,
      });
      if (!student) throw new NotFoundException('Alumno no encontrado');
      students = [student];
      type = 'STUDENT';
      id = student.id;
      label = `${student.firstName} ${student.lastName}`;
    }

    const recipients = new Set<string>();
    const withoutEmail: string[] = [];
    for (const s of students) {
      const guardianEmails = s.guardians
        .map((g) => g.email?.trim().toLowerCase())
        .filter((e): e is string => !!e);
      const emails = guardianEmails.length
        ? guardianEmails
        : s.email
          ? [s.email.trim().toLowerCase()]
          : [];
      if (emails.length === 0) withoutEmail.push(`${s.firstName} ${s.lastName}`);
      emails.forEach((e) => recipients.add(e));
    }

    return { type, id, label, recipients: [...recipients], withoutEmail };
  }

  async preview(tenantId: string, dto: MessageTargetDto) {
    const r = await this.resolve(tenantId, dto);
    return {
      targetLabel: r.label,
      recipients: r.recipients.length,
      withoutEmail: r.withoutEmail,
      emailConfigured: this.email.enabled,
    };
  }

  async send(tenantId: string, userId: string, dto: SendMessageDto) {
    if (!this.email.enabled) {
      throw new BadRequestException(
        'El envío de email no está configurado. No se ha enviado nada.',
      );
    }
    const r = await this.resolve(tenantId, dto);
    if (r.recipients.length === 0) {
      throw new BadRequestException('Ningún destinatario tiene email.');
    }
    if (r.recipients.length > MAX_RECIPIENTS) {
      throw new BadRequestException(
        `Demasiados destinatarios (${r.recipients.length}); máximo ${MAX_RECIPIENTS}.`,
      );
    }

    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { name: true, legalName: true, contactEmail: true, contactPhone: true },
    });
    const subject = dto.subject.trim();
    const html = messageHtml({
      academy: tenant.legalName ?? tenant.name,
      body: dto.body,
      contactEmail: tenant.contactEmail,
      contactPhone: tenant.contactPhone,
    });

    // One email per recipient: families never see each other's addresses.
    let sent = 0;
    let failed = 0;
    for (let i = 0; i < r.recipients.length; i += CONCURRENCY) {
      const chunk = r.recipients.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        chunk.map((to) =>
          this.email.send([to], subject, html, {
            fromName: tenant.name,
            replyTo: tenant.contactEmail,
          }),
        ),
      );
      for (const ok of results) ok ? sent++ : failed++;
    }

    const message = await this.prisma.message.create({
      data: {
        tenantId,
        subject,
        body: dto.body,
        targetType: r.type,
        targetId: r.id,
        targetLabel: r.label,
        recipientCount: r.recipients.length,
        sentCount: sent,
        failedCount: failed,
        createdById: userId,
      },
    });

    return {
      id: message.id,
      recipients: r.recipients.length,
      sent,
      failed,
      withoutEmail: r.withoutEmail,
    };
  }

  list(tenantId: string) {
    return this.prisma.message.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        subject: true,
        targetType: true,
        targetLabel: true,
        recipientCount: true,
        sentCount: true,
        failedCount: true,
        createdAt: true,
      },
    });
  }
}
