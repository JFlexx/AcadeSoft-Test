import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BulkUpsertAttendanceDto } from './dto/bulk-upsert-attendance.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  async bulkUpsert(tenantId: string, sessionId: string, dto: BulkUpsertAttendanceDto) {
    await this.ensureSessionInTenant(tenantId, sessionId);

    const studentIds = dto.items.map((i) => i.studentId);
    const uniqueStudentIds = [...new Set(studentIds)];
    if (uniqueStudentIds.length !== studentIds.length) {
      throw new BadRequestException('Duplicate studentId in items');
    }

    const found = await this.prisma.student.findMany({
      where: { id: { in: uniqueStudentIds }, tenantId },
      select: { id: true },
    });
    if (found.length !== uniqueStudentIds.length) {
      throw new BadRequestException('One or more students not found in tenant');
    }

    return this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.attendance.upsert({
          where: { sessionId_studentId: { sessionId, studentId: item.studentId } },
          update: { status: item.status, notes: item.notes },
          create: {
            sessionId,
            studentId: item.studentId,
            status: item.status,
            notes: item.notes,
          },
        }),
      ),
    );
  }

  async findAll(tenantId: string, sessionId: string) {
    await this.ensureSessionInTenant(tenantId, sessionId);
    return this.prisma.attendance.findMany({
      where: { sessionId },
      orderBy: { markedAt: 'asc' },
    });
  }

  async update(
    tenantId: string,
    sessionId: string,
    studentId: string,
    dto: UpdateAttendanceDto,
  ) {
    await this.ensureSessionInTenant(tenantId, sessionId);
    const existing = await this.prisma.attendance.findUnique({
      where: { sessionId_studentId: { sessionId, studentId } },
    });
    if (!existing) throw new NotFoundException();

    return this.prisma.attendance.update({
      where: { sessionId_studentId: { sessionId, studentId } },
      data: { status: dto.status, notes: dto.notes },
    });
  }

  async remove(tenantId: string, sessionId: string, studentId: string): Promise<void> {
    await this.ensureSessionInTenant(tenantId, sessionId);
    const existing = await this.prisma.attendance.findUnique({
      where: { sessionId_studentId: { sessionId, studentId } },
    });
    if (!existing) throw new NotFoundException();

    await this.prisma.attendance.delete({
      where: { sessionId_studentId: { sessionId, studentId } },
    });
  }

  private async ensureSessionInTenant(tenantId: string, sessionId: string): Promise<void> {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, tenantId },
      select: { id: true },
    });
    if (!session) throw new NotFoundException('Session not found');
  }
}
