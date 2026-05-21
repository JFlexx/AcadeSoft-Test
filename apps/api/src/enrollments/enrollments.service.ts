import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto';
import { UpdateEnrollmentDto } from './dto/update-enrollment.dto';
import { FindEnrollmentsDto } from './dto/find-enrollments.dto';

@Injectable()
export class EnrollmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateEnrollmentDto) {
    await this.ensureStudentInTenant(tenantId, dto.studentId);
    await this.ensureGroupInTenant(tenantId, dto.groupId);

    try {
      return await this.prisma.enrollment.create({
        data: {
          studentId: dto.studentId,
          groupId: dto.groupId,
          status: dto.status,
          notes: dto.notes,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('Student already enrolled in this group');
      }
      throw err;
    }
  }

  findAll(tenantId: string, query: FindEnrollmentsDto) {
    return this.prisma.enrollment.findMany({
      where: {
        student: { tenantId },
        ...(query.studentId && { studentId: query.studentId }),
        ...(query.groupId && { groupId: query.groupId }),
        ...(query.status && { status: query.status }),
      },
      orderBy: { enrolledAt: 'desc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { id, student: { tenantId } },
    });
    if (!enrollment) throw new NotFoundException();
    return enrollment;
  }

  async update(tenantId: string, id: string, dto: UpdateEnrollmentDto) {
    await this.findOne(tenantId, id);
    return this.prisma.enrollment.update({
      where: { id },
      data: {
        status: dto.status,
        droppedAt: dto.droppedAt ? new Date(dto.droppedAt) : undefined,
        notes: dto.notes,
        monthlyFeeOverride:
          dto.monthlyFeeOverride === undefined
            ? undefined
            : dto.monthlyFeeOverride === null
              ? null
              : new Prisma.Decimal(dto.monthlyFeeOverride),
      },
    });
  }

  async remove(tenantId: string, id: string): Promise<void> {
    await this.findOne(tenantId, id);
    await this.prisma.enrollment.delete({ where: { id } });
  }

  private async ensureStudentInTenant(tenantId: string, studentId: string): Promise<void> {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenantId },
      select: { id: true },
    });
    if (!student) throw new BadRequestException('Student not found in tenant');
  }

  private async ensureGroupInTenant(tenantId: string, groupId: string): Promise<void> {
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, tenantId },
      select: { id: true },
    });
    if (!group) throw new BadRequestException('Group not found in tenant');
  }
}
