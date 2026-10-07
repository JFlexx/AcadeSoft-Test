import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { addDays, ymdOf } from '../class-schedule/zoned-time';
import { CreateAssessmentDto, SaveResultsDto, UpdateAssessmentDto } from './dto/assessment.dto';

/**
 * Who is acting: the admin sees every group of the academy; a teacher only
 * the groups they teach.
 */
export type AssessmentScope = { tenantId: string; teacherId?: string };

@Injectable()
export class AssessmentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** For a logged-in teacher user: their teacher id, or 403. */
  async teacherScope(tenantId: string, userId: string): Promise<AssessmentScope> {
    const teacher = await this.prisma.teacher.findFirst({
      where: { tenantId, userId },
      select: { id: true },
    });
    if (!teacher) throw new ForbiddenException('Tu usuario no está vinculado a ningún profesor');
    return { tenantId, teacherId: teacher.id };
  }

  /** The groups a teacher teaches, for the grades screen of their app. */
  async teacherGroups(scope: AssessmentScope) {
    const groups = await this.prisma.group.findMany({
      where: { tenantId: scope.tenantId, teacherId: scope.teacherId, isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        course: { select: { name: true, color: true } },
        _count: { select: { enrollments: { where: { status: 'ACTIVE' } }, assessments: true } },
      },
    });
    return groups.map(({ _count, ...g }) => ({
      ...g,
      students: _count.enrollments,
      assessments: _count.assessments,
    }));
  }

  async list(scope: AssessmentScope, groupId: string) {
    await this.group(scope, groupId);
    const rows = await this.prisma.assessment.findMany({
      where: { groupId },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        name: true,
        date: true,
        results: { select: { score: true } },
      },
    });
    return rows.map(({ results, date, ...a }) => {
      const scores = results.map((r) => r.score).filter((s): s is Prisma.Decimal => s != null);
      const average = scores.length
        ? scores
            .reduce((sum, s) => sum.add(s), new Prisma.Decimal(0))
            .div(scores.length)
            .toFixed(2)
        : null;
      return { ...a, date: ymdOf(date), graded: scores.length, average };
    });
  }

  async create(scope: AssessmentScope, groupId: string, dto: CreateAssessmentDto) {
    const group = await this.group(scope, groupId);
    this.validDate(dto.date);
    const a = await this.prisma.assessment.create({
      data: {
        tenantId: scope.tenantId,
        groupId: group.id,
        name: dto.name.trim(),
        date: new Date(dto.date),
      },
    });
    return this.detail(scope, a.id);
  }

  async update(scope: AssessmentScope, id: string, dto: UpdateAssessmentDto) {
    await this.find(scope, id);
    if (dto.date) this.validDate(dto.date);
    await this.prisma.assessment.update({
      where: { id },
      data: { name: dto.name?.trim(), date: dto.date ? new Date(dto.date) : undefined },
    });
    return this.detail(scope, id);
  }

  async remove(scope: AssessmentScope, id: string): Promise<void> {
    await this.find(scope, id);
    await this.prisma.assessment.delete({ where: { id } });
  }

  /** The assessment with its roster: active students plus anyone graded. */
  async detail(scope: AssessmentScope, id: string) {
    const a = await this.find(scope, id);
    const results = await this.prisma.assessmentResult.findMany({
      where: { assessmentId: id },
      select: { studentId: true, score: true, comment: true },
    });
    const byStudent = new Map(results.map((r) => [r.studentId, r]));
    const students = await this.prisma.student.findMany({
      where: {
        tenantId: scope.tenantId,
        OR: [
          { enrollments: { some: { groupId: a.groupId, status: 'ACTIVE' } } },
          { id: { in: [...byStudent.keys()] } },
        ],
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: { id: true, firstName: true, lastName: true },
    });
    return {
      id: a.id,
      name: a.name,
      date: ymdOf(a.date),
      group: { id: a.group.id, name: a.group.name },
      students: students.map((s) => {
        const r = byStudent.get(s.id);
        return { ...s, result: r ? { score: r.score, comment: r.comment } : null };
      }),
    };
  }

  /** Saves grades; an item with neither score nor comment clears that grade. */
  async saveResults(scope: AssessmentScope, id: string, dto: SaveResultsDto) {
    const current = await this.detail(scope, id);
    const roster = new Set(current.students.map((s) => s.id));
    const ids = dto.items.map((i) => i.studentId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Hay alumnos repetidos');
    if (ids.some((sid) => !roster.has(sid))) {
      throw new BadRequestException('Algún alumno no pertenece a este grupo');
    }

    await this.prisma.$transaction(
      dto.items.map((item) => {
        const score = item.score == null ? null : new Prisma.Decimal(item.score);
        const comment = item.comment?.trim() || null;
        const where = { assessmentId_studentId: { assessmentId: id, studentId: item.studentId } };
        return score == null && comment == null
          ? this.prisma.assessmentResult.deleteMany({
              where: { assessmentId: id, studentId: item.studentId },
            })
          : this.prisma.assessmentResult.upsert({
              where,
              update: { score, comment },
              create: { assessmentId: id, studentId: item.studentId, score, comment },
            });
      }),
    );
    return this.detail(scope, id);
  }

  private async group(scope: AssessmentScope, groupId: string) {
    const group = await this.prisma.group.findFirst({
      where: {
        id: groupId,
        tenantId: scope.tenantId,
        ...(scope.teacherId && { teacherId: scope.teacherId }),
      },
      select: { id: true, name: true },
    });
    if (!group) throw new NotFoundException();
    return group;
  }

  private async find(scope: AssessmentScope, id: string) {
    const a = await this.prisma.assessment.findFirst({
      where: {
        id,
        tenantId: scope.tenantId,
        ...(scope.teacherId && { group: { teacherId: scope.teacherId } }),
      },
      select: {
        id: true,
        name: true,
        date: true,
        groupId: true,
        group: { select: { id: true, name: true } },
      },
    });
    if (!a) throw new NotFoundException();
    return a;
  }

  private validDate(ymd: string) {
    if (addDays(ymd, 0) !== ymd) throw new BadRequestException(`Fecha no válida: ${ymd}`);
  }
}
