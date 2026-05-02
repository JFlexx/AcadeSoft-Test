import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';

@Injectable()
export class GroupsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateGroupDto) {
    await this.ensureCourseInTenant(tenantId, dto.courseId);
    if (dto.teacherId) await this.ensureTeacherInTenant(tenantId, dto.teacherId);

    const data: Prisma.GroupUncheckedCreateInput = {
      tenantId,
      courseId: dto.courseId,
      teacherId: dto.teacherId,
      name: dto.name,
      description: dto.description,
      schedule: dto.schedule as Prisma.InputJsonValue | undefined,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      maxCapacity: dto.maxCapacity,
    };
    return this.prisma.group.create({ data });
  }

  findAll(tenantId: string) {
    return this.prisma.group.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const group = await this.prisma.group.findFirst({
      where: { id, tenantId },
    });
    if (!group) throw new NotFoundException();
    return group;
  }

  async update(tenantId: string, id: string, dto: UpdateGroupDto) {
    await this.findOne(tenantId, id);
    if (dto.courseId) await this.ensureCourseInTenant(tenantId, dto.courseId);
    if (dto.teacherId) await this.ensureTeacherInTenant(tenantId, dto.teacherId);

    const data: Prisma.GroupUncheckedUpdateInput = {
      courseId: dto.courseId,
      teacherId: dto.teacherId,
      name: dto.name,
      description: dto.description,
      schedule: dto.schedule as Prisma.InputJsonValue | undefined,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      maxCapacity: dto.maxCapacity,
      isActive: dto.isActive,
    };
    return this.prisma.group.update({ where: { id }, data });
  }

  async remove(tenantId: string, id: string): Promise<void> {
    await this.findOne(tenantId, id);
    await this.prisma.group.delete({ where: { id } });
  }

  private async ensureCourseInTenant(tenantId: string, courseId: string): Promise<void> {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, tenantId },
      select: { id: true },
    });
    if (!course) throw new BadRequestException('Course not found in tenant');
  }

  private async ensureTeacherInTenant(tenantId: string, teacherId: string): Promise<void> {
    const teacher = await this.prisma.teacher.findFirst({
      where: { id: teacherId, tenantId },
      select: { id: true },
    });
    if (!teacher) throw new BadRequestException('Teacher not found in tenant');
  }
}
