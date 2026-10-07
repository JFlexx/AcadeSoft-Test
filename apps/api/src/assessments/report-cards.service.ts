import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { escapeHtml } from '../email/html';
import { familyEmails } from '../email/family-emails';
import { addDays, ymdOf, zonedToUtc } from '../class-schedule/zoned-time';
import { buildReportCardPdf, ReportCardData } from './report-card-pdf';
import { ReportCardDto } from './dto/report-card.dto';

/**
 * Report cards (boletines): for a student and a term, each group's
 * assessments with their grades and comments, the average and the
 * attendance. Downloadable as PDF, or emailed to every family of a group.
 */
@Injectable()
export class ReportCardsService {
  private readonly logger = new Logger(ReportCardsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  async data(tenantId: string, studentId: string, dto: ReportCardDto, groupId?: string) {
    this.validRange(dto);
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: {
        name: true,
        legalName: true,
        address: true,
        contactEmail: true,
        contactPhone: true,
        timezone: true,
      },
    });
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenantId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!student) throw new NotFoundException();

    const from = new Date(dto.from);
    const to = new Date(dto.to);
    const results = await this.prisma.assessmentResult.findMany({
      where: {
        studentId,
        assessment: { date: { gte: from, lte: to }, ...(groupId && { groupId }) },
      },
      orderBy: { assessment: { date: 'asc' } },
      select: {
        score: true,
        comment: true,
        assessment: { select: { name: true, date: true, groupId: true } },
      },
    });
    // Groups: the active ones plus any with grades in the term.
    const groupIds = groupId
      ? [groupId]
      : [
          ...new Set([
            ...(
              await this.prisma.enrollment.findMany({
                where: { studentId, status: 'ACTIVE' },
                select: { groupId: true },
              })
            ).map((e) => e.groupId),
            ...results.map((r) => r.assessment.groupId),
          ]),
        ];
    const groups = await this.prisma.group.findMany({
      where: { id: { in: groupIds }, tenantId },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        course: { select: { name: true } },
        teacher: { select: { firstName: true, lastName: true } },
      },
    });

    const tz = tenant.timezone;
    const start = zonedToUtc(dto.from, '00:00', tz);
    const end = zonedToUtc(addDays(dto.to, 1), '00:00', tz);
    const attendance = await this.prisma.attendance.findMany({
      where: {
        studentId,
        session: { groupId: { in: groupIds }, scheduledAt: { gte: start, lt: end } },
      },
      select: { status: true, session: { select: { groupId: true } } },
    });

    const data: ReportCardData = {
      academy: {
        name: tenant.legalName ?? tenant.name,
        address: tenant.address,
        contactEmail: tenant.contactEmail,
        contactPhone: tenant.contactPhone,
      },
      title: dto.title?.trim() || 'Boletín de notas',
      period: { from: dto.from, to: dto.to },
      student: { firstName: student.firstName, lastName: student.lastName },
      groups: groups.map((g) => {
        const mine = results.filter((r) => r.assessment.groupId === g.id);
        const scores = mine.map((r) => r.score).filter((s): s is Prisma.Decimal => s != null);
        const marks = attendance.filter((a) => a.session.groupId === g.id);
        const attended = marks.filter((a) => a.status === 'PRESENT' || a.status === 'LATE').length;
        return {
          name: g.name,
          course: g.course.name,
          teacher: g.teacher ? `${g.teacher.firstName} ${g.teacher.lastName}` : null,
          assessments: mine.map((r) => ({
            date: ymdOf(r.assessment.date),
            name: r.assessment.name,
            score: r.score?.toString() ?? null,
            comment: r.comment,
          })),
          average: scores.length
            ? scores
                .reduce((sum, s) => sum.add(s), new Prisma.Decimal(0))
                .div(scores.length)
                .toFixed(2)
            : null,
          attendance: {
            attended,
            marked: marks.length,
            pct: marks.length ? Math.round((attended / marks.length) * 100) : null,
          },
        };
      }),
    };
    return data;
  }

  async pdf(tenantId: string, studentId: string, dto: ReportCardDto, groupId?: string) {
    const data = await this.data(tenantId, studentId, dto, groupId);
    const buffer = await buildReportCardPdf(data);
    return { buffer, filename: this.filename(data) };
  }

  /** Who would receive the group's report cards (for the confirmation). */
  async preview(tenantId: string, groupId: string) {
    const students = await this.groupStudents(tenantId, groupId);
    return {
      students: students.map((s) => ({
        id: s.id,
        name: `${s.firstName} ${s.lastName}`,
        hasEmail: familyEmails(s).length > 0,
      })),
      emailConfigured: this.email.enabled,
    };
  }

  /** Emails each active student's report card (this group's grades) as a PDF. */
  async sendGroup(tenantId: string, groupId: string, dto: ReportCardDto) {
    this.validRange(dto);
    if (!this.email.enabled) throw new BadRequestException('El envío de email no está configurado');
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { name: true, contactEmail: true },
    });
    const students = await this.groupStudents(tenantId, groupId);

    let sent = 0;
    let withoutEmail = 0;
    let failed = 0;
    for (const s of students) {
      const to = familyEmails(s);
      if (to.length === 0) {
        withoutEmail++;
        continue;
      }
      try {
        const { buffer, filename } = await this.pdf(tenantId, s.id, dto, groupId);
        const title = dto.title?.trim() || 'Boletín de notas';
        const ok = await this.email.send(
          to,
          `${title} — ${s.firstName} ${s.lastName}`,
          `<!doctype html><html lang="es"><body style="font-family:Arial,sans-serif;color:#111;line-height:1.5">
<p>Hola,</p>
<p>Os enviamos el boletín de notas de <strong>${escapeHtml(`${s.firstName} ${s.lastName}`)}</strong>
(${escapeHtml(title)}). Lo encontraréis adjunto en PDF.</p>
<p>Si tenéis cualquier duda, responded a este email.</p>
<p>Un saludo,<br>${escapeHtml(tenant.name)}</p></body></html>`,
          {
            fromName: tenant.name,
            replyTo: tenant.contactEmail,
            attachments: [{ filename, content: buffer }],
          },
        );
        if (ok) sent++;
        else failed++;
      } catch (err) {
        this.logger.error(`Report card failed: ${String(err)}`);
        failed++;
      }
    }
    return { sent, withoutEmail, failed };
  }

  private async groupStudents(tenantId: string, groupId: string) {
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, tenantId },
      select: { id: true },
    });
    if (!group) throw new NotFoundException();
    return this.prisma.student.findMany({
      where: { tenantId, enrollments: { some: { groupId, status: 'ACTIVE' } } },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        guardians: { select: { email: true } },
      },
    });
  }

  private filename(d: ReportCardData) {
    const slug = `${d.student.firstName}-${d.student.lastName}`
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .toLowerCase();
    return `boletin-${slug}-${d.period.from}.pdf`;
  }

  private validRange(dto: ReportCardDto) {
    for (const d of [dto.from, dto.to]) {
      if (addDays(d, 0) !== d) throw new BadRequestException(`Fecha no válida: ${d}`);
    }
    if (dto.from > dto.to)
      throw new BadRequestException('La fecha de inicio es posterior a la de fin');
  }
}
