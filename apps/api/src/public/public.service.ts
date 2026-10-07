import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { familyEmails } from '../email/family-emails';
import { PublicEnrollDto } from './dto/public-enroll.dto';
import { PublicTrialDto } from './dto/public-trial.dto';
import { trialHtml, trialSubject } from './trial-email';

const HOUR_MS = 3_600_000;
/** Trials can be booked from 2 hours to 30 days ahead… */
const TRIAL_MIN_LEAD_MS = 2 * HOUR_MS;
const TRIAL_MAX_AHEAD_MS = 30 * 24 * HOUR_MS;
/** …in the next few classes, with at most this many trials per class. */
const TRIAL_SESSIONS_SHOWN = 8;
export const MAX_TRIALS_PER_SESSION = 3;

type Prospect = Pick<
  PublicEnrollDto,
  'firstName' | 'lastName' | 'email' | 'phone' | 'guardianName' | 'guardianEmail' | 'guardianPhone'
>;

@Injectable()
export class PublicService {
  private readonly logger = new Logger(PublicService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  private async tenantBySlug(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        trialClassesEnabled: true,
        legalName: true,
        taxId: true,
        address: true,
        contactEmail: true,
      },
    });
    if (!tenant) throw new NotFoundException('Academia no encontrada');
    return tenant;
  }

  /** Active groups a prospective family can enroll into, with spots left. */
  async enrollableGroups(slug: string) {
    const tenant = await this.tenantBySlug(slug);
    const groups = await this.prisma.group.findMany({
      where: { tenantId: tenant.id, isActive: true },
      select: {
        id: true,
        name: true,
        maxCapacity: true,
        monthlyFee: true,
        course: { select: { name: true } },
      },
      orderBy: { name: 'asc' },
    });

    const activeByGroup = await this.activeCounts(groups.map((g) => g.id));

    return {
      academy: tenant.name,
      // Who is responsible for the family's data (for the privacy policy).
      controller: {
        name: tenant.legalName ?? tenant.name,
        taxId: tenant.taxId,
        address: tenant.address,
        contactEmail: tenant.contactEmail,
      },
      trialClasses: tenant.trialClassesEnabled,
      groups: groups.map((g) => ({
        id: g.id,
        name: g.name,
        course: g.course.name,
        monthlyFee: g.monthlyFee,
        spotsAvailable:
          g.maxCapacity == null
            ? null
            : Math.max(0, g.maxCapacity - (activeByGroup.get(g.id) ?? 0)),
      })),
    };
  }

  async enroll(slug: string, dto: PublicEnrollDto) {
    const tenant = await this.tenantBySlug(slug);

    const group = await this.prisma.group.findFirst({
      where: { id: dto.groupId, tenantId: tenant.id, isActive: true },
      select: { id: true, maxCapacity: true },
    });
    if (!group) throw new BadRequestException('Grupo no disponible');

    const full = await this.isFull(group);
    if (full && !dto.waitlist) {
      throw new BadRequestException('Este grupo está completo');
    }

    return this.prisma.$transaction(async (tx) => {
      const student = await this.createProspect(tx, tenant.id, dto);

      const enrollment = await tx.enrollment.create({
        data: {
          studentId: student.id,
          groupId: group.id,
          status: full ? 'WAITLIST' : 'PENDING',
          notes: dto.notes?.trim(),
        },
      });

      if (!full) {
        return { ok: true, studentId: student.id, enrollmentId: enrollment.id, waitlisted: false };
      }
      const position = await tx.enrollment.count({
        where: { groupId: group.id, status: 'WAITLIST' },
      });
      return {
        ok: true,
        studentId: student.id,
        enrollmentId: enrollment.id,
        waitlisted: true,
        position,
      };
    });
  }

  /**
   * Upcoming classes of a group a family can book a free trial in. Empty
   * when the group is full: they'd be sent to the waiting list instead.
   */
  async trialSessions(slug: string, groupId: string, now = new Date()) {
    const tenant = await this.tenantBySlug(slug);
    if (!tenant.trialClassesEnabled) throw new NotFoundException();
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, tenantId: tenant.id, isActive: true },
      select: { id: true, maxCapacity: true },
    });
    if (!group) throw new NotFoundException('Grupo no disponible');
    if (await this.isFull(group)) return { full: true, sessions: [] };

    const sessions = await this.prisma.session.findMany({
      where: {
        groupId,
        status: 'SCHEDULED',
        scheduledAt: {
          gte: new Date(now.getTime() + TRIAL_MIN_LEAD_MS),
          lte: new Date(now.getTime() + TRIAL_MAX_AHEAD_MS),
        },
      },
      orderBy: { scheduledAt: 'asc' },
      select: {
        id: true,
        scheduledAt: true,
        durationMinutes: true,
        _count: { select: { trialClasses: { where: { status: { not: 'CANCELLED' } } } } },
      },
    });
    return {
      full: false,
      sessions: sessions
        .filter((s) => s._count.trialClasses < MAX_TRIALS_PER_SESSION)
        .slice(0, TRIAL_SESSIONS_SHOWN)
        .map(({ _count, ...s }) => {
          void _count;
          return s;
        }),
    };
  }

  /** Books a free trial class and emails the family a confirmation. */
  async bookTrial(slug: string, dto: PublicTrialDto, now = new Date()) {
    const tenant = await this.tenantBySlug(slug);
    if (!tenant.trialClassesEnabled) {
      throw new BadRequestException('Esta academia no ofrece clases de prueba online');
    }

    const session = await this.prisma.session.findFirst({
      where: { id: dto.sessionId, tenantId: tenant.id },
      select: {
        id: true,
        status: true,
        scheduledAt: true,
        group: {
          select: {
            id: true,
            name: true,
            isActive: true,
            maxCapacity: true,
            course: { select: { name: true } },
          },
        },
        _count: { select: { trialClasses: { where: { status: { not: 'CANCELLED' } } } } },
      },
    });
    const t = session?.scheduledAt.getTime() ?? 0;
    if (
      !session ||
      !session.group.isActive ||
      session.status !== 'SCHEDULED' ||
      t < now.getTime() + TRIAL_MIN_LEAD_MS ||
      t > now.getTime() + TRIAL_MAX_AHEAD_MS
    ) {
      throw new BadRequestException('Esa clase ya no está disponible');
    }
    if (session._count.trialClasses >= MAX_TRIALS_PER_SESSION || (await this.isFull(session.group))) {
      throw new BadRequestException('Esa clase ya no tiene plazas de prueba: elige otro día');
    }

    const student = await this.prisma.$transaction(async (tx) => {
      const created = await this.createProspect(tx, tenant.id, dto, dto.notes);
      await tx.trialClass.create({
        data: { tenantId: tenant.id, sessionId: session.id, studentId: created.id },
      });
      return created;
    });

    await this.sendTrialConfirmation(tenant.id, student.id, session);
    return { ok: true, scheduledAt: session.scheduledAt, groupName: session.group.name };
  }

  /** Best effort: the booking stands even if the email can't be sent. */
  private async sendTrialConfirmation(
    tenantId: string,
    studentId: string,
    session: { scheduledAt: Date; group: { name: string; course: { name: string } } },
  ) {
    try {
      const [tenant, student] = await Promise.all([
        this.prisma.tenant.findUniqueOrThrow({
          where: { id: tenantId },
          select: {
            name: true,
            legalName: true,
            address: true,
            contactEmail: true,
            contactPhone: true,
            timezone: true,
          },
        }),
        this.prisma.student.findUniqueOrThrow({
          where: { id: studentId },
          select: {
            firstName: true,
            lastName: true,
            email: true,
            guardians: { select: { email: true } },
          },
        }),
      ]);
      const to = familyEmails(student);
      if (to.length === 0) return;
      const data = {
        academy: tenant.legalName ?? tenant.name,
        studentName: `${student.firstName} ${student.lastName}`,
        groupName: session.group.name,
        courseName: session.group.course.name,
        when: session.scheduledAt.toLocaleString('es-ES', {
          timeZone: tenant.timezone,
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          hour: '2-digit',
          minute: '2-digit',
        }),
        address: tenant.address,
        contactEmail: tenant.contactEmail,
        contactPhone: tenant.contactPhone,
      };
      await this.email.send(to, trialSubject(data), trialHtml(data), {
        fromName: tenant.name,
        replyTo: tenant.contactEmail,
      });
    } catch (err) {
      this.logger.error(`Trial confirmation failed: ${String(err)}`);
    }
  }

  private async activeCounts(groupIds: string[]) {
    const counts = await this.prisma.enrollment.groupBy({
      by: ['groupId'],
      where: { groupId: { in: groupIds }, status: 'ACTIVE' },
      _count: true,
    });
    return new Map(counts.map((c) => [c.groupId, c._count]));
  }

  private async isFull(group: { id: string; maxCapacity: number | null }) {
    if (group.maxCapacity == null) return false;
    const active = await this.prisma.enrollment.count({
      where: { groupId: group.id, status: 'ACTIVE' },
    });
    return active >= group.maxCapacity;
  }

  /** The student (and guardian, if given) behind a public request. */
  private async createProspect(
    tx: Prisma.TransactionClient,
    tenantId: string,
    dto: Prospect,
    notes?: string,
  ) {
    const student = await tx.student.create({
      data: {
        tenantId,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        email: dto.email?.trim(),
        phone: dto.phone?.trim(),
        notes: notes?.trim() || undefined,
        privacyAcceptedAt: new Date(),
      },
    });

    if (dto.guardianName?.trim()) {
      const parts = dto.guardianName.trim().split(/\s+/);
      const firstName = parts[0];
      const lastName = parts.slice(1).join(' ') || parts[0];
      await tx.guardian.create({
        data: {
          studentId: student.id,
          firstName,
          lastName,
          relationship: 'Tutor',
          email: dto.guardianEmail?.trim(),
          phone: dto.guardianPhone?.trim(),
        },
      });
    }
    return student;
  }
}
