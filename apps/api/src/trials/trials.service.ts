import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConvertTrialDto } from './dto/convert-trial.dto';
import { chargeEnrollmentFee, feeSummary } from '../enrollments/enrollment-fee';

/** Admin side of trial classes: who's coming, who came, and enrolling them. */
@Injectable()
export class TrialsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Most recent first; the page splits them into upcoming / follow-up / done. */
  async list(tenantId: string) {
    const rows = await this.prisma.trialClass.findMany({
      where: { tenantId },
      orderBy: { session: { scheduledAt: 'desc' } },
      take: 200,
      select: {
        id: true,
        status: true,
        createdAt: true,
        studentId: true,
        student: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            notes: true,
            guardians: { select: { firstName: true, lastName: true, email: true, phone: true } },
          },
        },
        session: {
          select: {
            id: true,
            scheduledAt: true,
            status: true,
            group: {
              select: { id: true, name: true, enrollmentFee: true, course: { select: { name: true } } },
            },
            attendances: { select: { studentId: true, status: true } },
          },
        },
      },
    });
    return rows.map(({ session: { attendances, ...session }, ...t }) => ({
      ...t,
      session,
      attendance: attendances.find((a) => a.studentId === t.studentId)?.status ?? null,
    }));
  }

  /** Enrolls the trial student in the group they tried. */
  async convert(tenantId: string, id: string, dto: ConvertTrialDto) {
    const trial = await this.find(tenantId, id);
    if (trial.status === 'CANCELLED') {
      throw new BadRequestException('La clase de prueba está cancelada');
    }
    const groupId = trial.session.groupId;
    const existing = await this.prisma.enrollment.findUnique({
      where: { studentId_groupId: { studentId: trial.studentId, groupId } },
    });
    if (existing && trial.status === 'CONVERTED') {
      throw new ConflictException('Ya está inscrito en este grupo');
    }

    const status = dto.status ?? 'ACTIVE';
    return this.prisma.$transaction(async (tx) => {
      const e = existing
        ? await tx.enrollment.update({
            where: { id: existing.id },
            data: { status, enrolledAt: new Date() },
          })
        : await tx.enrollment.create({
            data: { studentId: trial.studentId, groupId, status },
          });
      await tx.trialClass.update({ where: { id }, data: { status: 'CONVERTED' } });
      const fee =
        status === 'ACTIVE' && dto.chargeEnrollmentFee !== false
          ? await chargeEnrollmentFee(tx, tenantId, e.id)
          : null;
      return { enrollment: e, enrollmentFeeInvoice: feeSummary(fee) };
    });
  }

  async cancel(tenantId: string, id: string) {
    const trial = await this.find(tenantId, id);
    if (trial.status !== 'BOOKED') {
      throw new BadRequestException('Solo se puede cancelar una clase de prueba reservada');
    }
    return this.prisma.trialClass.update({ where: { id }, data: { status: 'CANCELLED' } });
  }

  private async find(tenantId: string, id: string) {
    const trial = await this.prisma.trialClass.findFirst({
      where: { id, tenantId },
      select: { status: true, studentId: true, session: { select: { groupId: true } } },
    });
    if (!trial) throw new NotFoundException();
    return trial;
  }
}
