import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AbsenceNoticesService } from '../absence-notices/absence-notices.service';
import { BulkUpsertAttendanceDto } from '../attendance/dto/bulk-upsert-attendance.dto';
import { addDays, todayIn, zonedToUtc } from '../class-schedule/zoned-time';
import { FindTeacherSessionsDto } from './dto/find-teacher-sessions.dto';

const DEFAULT_DAYS = 7;
const MAX_RANGE_MS = 62 * 24 * 60 * 60 * 1000;

const GROUP_SELECT = {
  id: true,
  name: true,
  course: { select: { name: true, color: true } },
} satisfies Prisma.GroupSelect;

/**
 * What a teacher sees when they log in: their own classes and the roster to
 * take attendance. A class is theirs if it is assigned to them, or has no
 * teacher of its own and belongs to a group they teach.
 */
@Injectable()
export class TeacherAppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly absences: AbsenceNoticesService,
  ) {}

  async me(tenantId: string, userId: string) {
    const teacher = await this.teacher(tenantId, userId);
    return {
      id: teacher.id,
      firstName: teacher.firstName,
      lastName: teacher.lastName,
      academy: teacher.tenant.name,
    };
  }

  async sessions(tenantId: string, userId: string, query: FindTeacherSessionsDto) {
    const teacher = await this.teacher(tenantId, userId);
    const tz = teacher.tenant.timezone;
    const from = query.from ? new Date(query.from) : zonedToUtc(todayIn(tz), '00:00', tz);
    const to = query.to
      ? new Date(query.to)
      : zonedToUtc(addDays(todayIn(tz, from), DEFAULT_DAYS), '00:00', tz);
    if (to <= from) throw new BadRequestException('El rango de fechas no es válido');
    if (to.getTime() - from.getTime() > MAX_RANGE_MS) {
      throw new BadRequestException('El rango no puede superar 62 días');
    }

    const rows = await this.prisma.session.findMany({
      where: {
        tenantId,
        scheduledAt: { gte: from, lt: to },
        ...this.mine(teacher.id),
      },
      orderBy: { scheduledAt: 'asc' },
      select: {
        id: true,
        scheduledAt: true,
        durationMinutes: true,
        status: true,
        group: {
          select: {
            ...GROUP_SELECT,
            _count: { select: { enrollments: { where: { status: 'ACTIVE' } } } },
          },
        },
        _count: { select: { attendances: true } },
      },
    });
    return rows.map(({ group: { _count: groupCount, ...group }, _count, ...s }) => ({
      ...s,
      group,
      enrolled: groupCount.enrollments,
      marked: _count.attendances,
    }));
  }

  async session(tenantId: string, userId: string, sessionId: string) {
    const teacher = await this.teacher(tenantId, userId);
    return this.detail(tenantId, teacher.id, sessionId);
  }

  async saveAttendance(
    tenantId: string,
    userId: string,
    sessionId: string,
    dto: BulkUpsertAttendanceDto,
  ) {
    const teacher = await this.teacher(tenantId, userId);
    const current = await this.detail(tenantId, teacher.id, sessionId);
    if (current.status === 'CANCELLED') {
      throw new BadRequestException('La clase está cancelada');
    }

    const roster = new Set(current.students.map((s) => s.id));
    const ids = dto.items.map((i) => i.studentId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Hay alumnos repetidos');
    }
    if (ids.some((id) => !roster.has(id))) {
      throw new BadRequestException('Algún alumno no pertenece a esta clase');
    }

    await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.attendance.upsert({
          where: { sessionId_studentId: { sessionId, studentId: item.studentId } },
          update: { status: item.status, notes: item.notes ?? null, markedAt: new Date() },
          create: {
            sessionId,
            studentId: item.studentId,
            status: item.status,
            notes: item.notes,
          },
        }),
      ),
    );
    const noticesSent = await this.absences.notify(
      sessionId,
      dto.items.filter((i) => i.status === 'ABSENT').map((i) => i.studentId),
    );
    return { ...(await this.detail(tenantId, teacher.id, sessionId)), noticesSent };
  }

  /** The session with its roster: active students, plus anyone already marked. */
  private async detail(tenantId: string, teacherId: string, sessionId: string) {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, tenantId, ...this.mine(teacherId) },
      select: {
        id: true,
        groupId: true,
        scheduledAt: true,
        durationMinutes: true,
        status: true,
        notes: true,
        group: { select: GROUP_SELECT },
        attendances: { select: { studentId: true, status: true, notes: true } },
      },
    });
    if (!session) throw new NotFoundException();

    const marked = new Map(session.attendances.map((a) => [a.studentId, a]));
    const students = await this.prisma.student.findMany({
      where: {
        tenantId,
        OR: [
          { enrollments: { some: { groupId: session.groupId, status: 'ACTIVE' } } },
          { id: { in: [...marked.keys()] } },
        ],
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: { id: true, firstName: true, lastName: true },
    });

    return {
      id: session.id,
      scheduledAt: session.scheduledAt,
      durationMinutes: session.durationMinutes,
      status: session.status,
      notes: session.notes,
      group: session.group,
      students: students.map((s) => {
        const a = marked.get(s.id);
        return { ...s, attendance: a ? { status: a.status, notes: a.notes } : null };
      }),
    };
  }

  private mine(teacherId: string): Prisma.SessionWhereInput {
    return { OR: [{ teacherId }, { teacherId: null, group: { teacherId } }] };
  }

  private async teacher(tenantId: string, userId: string) {
    const teacher = await this.prisma.teacher.findFirst({
      where: { tenantId, userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        tenant: { select: { name: true, timezone: true } },
      },
    });
    if (!teacher) {
      throw new ForbiddenException('Tu usuario no está vinculado a ningún profesor');
    }
    return teacher;
  }
}
